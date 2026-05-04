"""
AI Service
Wraps the OpenAI API for:
  - Document review & scoring
  - Draft generation in Founders' voice
  - Draft refinement (shorter / warmer / more formal / add urgency)
  - Rejection note generation
"""

import json
from typing import Any, Optional

from openai import AsyncOpenAI, BadRequestError

from core.config import settings
from core.exceptions import AIServiceError
from core.logging import get_logger
from models.models import Stakeholder
from pipeline.tracing import append_ai_call
from schemas.library import KnowledgeLibraryAnalysis
from schemas.submission import AIScorecardResponse, RefineDraftRequest

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Default brand-voice system prompt (stored in DB; this is the seed value)
# ---------------------------------------------------------------------------

DEFAULT_SYSTEM_PROMPT = """
You are the AI writing assistant for Lyfshilp Academy.

COMPANY:
Lyfshilp Academy — AI training for school students, college students, teachers, and corporates.

CREDENTIALS TO ALWAYS REFERENCE WHERE RELEVANT:
- Stanford Seed | GSB Top 100 South Asia
- DPIIT Recognised
- Incubated at IIIT Allahabad
- 38 partner schools
- 6,000+ students impacted

RESEARCH HOOKS TO USE WHERE RELEVANT:
- Harvard Business School research: AI boosts productivity 40%+
- MIT Sloan research on AI-assisted learning

SOCIAL PROOF SCHOOLS:
- DPS Mathura Road
- DPS Gurugram
- DPS Faridabad
- DPS Dehradun
- Mt. Carmel School Dwarka

TONE:
- Warm but authoritative
- Aspirational
- Never pushy or salesy
- Credibility-first, not product-first

CTA RULE:
- Always end with a low-friction CTA such as a 15-minute call, a specific date or link, or a single clear next step.

PRICING MENTIONS:
- Rs 2,999 + GST (Summer Programme)
- Rs 49,999 (Fellowship)
- Rs 10,000 (seat booking)

STAKEHOLDER RULES:
- Stakeholder-specific tone rules may be appended dynamically from founder-managed settings.
- When those rules are present, follow them strictly in addition to this base brand voice.

FORBIDDEN PHRASES:
- "We are pleased to inform"
- "Kindly"
- "Please find attached"
- "Hope this email finds you well"
- "I am writing to"
- "We would like to"

ALWAYS USE:
- Active voice
- Short punchy sentences
- Outcome-oriented language

EMOJI RULES:
- Emoji rules will be appended dynamically by the system engine based on stakeholder and document type context. Follow them strictly.
""".strip()


# ---------------------------------------------------------------------------
# Prompts factory
# ---------------------------------------------------------------------------

class PromptBuilder:
    """Builds structured prompts for each AI task."""

    @staticmethod
    def _mode_block(llm_mode: str, thinking_instructions: str | None = None) -> str:
        mode = (llm_mode or "guided").lower()
        if mode == "autonomous":
            mode_text = (
                "AUTONOMOUS MODE\n"
                "- Work independently using the available context and brand rules.\n"
                "- Do not ask for human feedback or clarification unless the prompt explicitly requires it.\n"
                "- Make the best reasonable assumptions when details are missing.\n"
                "- Keep moving toward a complete, usable draft."
            )
        else:
            mode_text = (
                "GUIDED MODE\n"
                "- Follow the user's instructions carefully.\n"
                "- Treat user guidance as the highest-priority writing direction after safety and brand rules.\n"
                "- If the user provides extra thinking instructions, incorporate them exactly."
            )
        if thinking_instructions:
            return f"{mode_text}\n\nUSER THINKING INSTRUCTIONS\n{thinking_instructions.strip()}"
        return mode_text

    @staticmethod
    def review(content: str, doc_type: str, stakeholder: str, guidance: str) -> str:
        return f"""
Review the following document for Lyfshilp Academy.

IMPORTANT EVALUATION SCOPE
- Treat the draft below as the generated output from the previous step.
- The text under "DRAFT TEXT TO REVIEW" is the ONLY text to evaluate.
- Do NOT score, rewrite, or grammar-check any guidance/context text.
- Grammar check must apply only to the draft text.
- Scoring must apply only to the draft text.

DOCUMENT TYPE: {doc_type}
STAKEHOLDER: {stakeholder}

Your task is to score this document across 5 dimensions (20 points each = 100 total):
1. tone_voice — Does it match Lyfshilp's warm-authoritative voice?
2. format_structure — Is the expected structure (Hook→Proof→CTA) followed?
3. stakeholder_fit — Is the language right for the selected stakeholder?
4. missing_elements — Are credibility markers, CTA, dates, links present?
5. improvement_scope — How much work is still needed?

Also generate:
- A grammar check score out of 20 with a few concrete notes on grammar, spelling, punctuation, or sentence clarity
- Up to 5 specific inline suggestions (original phrase → recommended replacement + reason)
- A complete rewrite of the document in the Founders' voice

Respond ONLY with valid JSON matching this exact structure:
{{
  "score": <0-100 integer>,
  "dimensions": {{
    "tone_voice": <0-20>,
    "format_structure": <0-20>,
    "stakeholder_fit": <0-20>,
    "missing_elements": <0-20>,
    "improvement_scope": <0-20>
  }},
  "grammar_check": {{
    "score": <0-20>,
    "notes": ["...", "..."]
  }},
  "suggestions": [
    {{"original": "...", "replacement": "...", "reason": "..."}}
  ],
  "rewrite": "<full rewritten document as a plain string>"
}}

================================================================================
BACKGROUND CONTEXT & RULES
================================================================================
{guidance}

================================================================================
DRAFT TEXT TO REVIEW
================================================================================
{content}
""".strip()

    @staticmethod
    def generate_draft(
        doc_type: str,
        stakeholder: str,
        context: dict,
        guidance: str,
        llm_mode: str = "guided",
        thinking_instructions: str | None = None,
        available_doc_types: list[str] | None = None,
        available_stakeholders: list[str] | None = None,
    ) -> str:
        founder_library_context = str(context.get("founder_library_context", "") or "").strip()
        context_lines = "\n".join(
            f"- {k}: {v}"
            for k, v in context.items()
            if k != "founder_library_context"
        )
        allowed_doc_types = ", ".join(available_doc_types or []) or "None"
        allowed_stakeholders = ", ".join(available_stakeholders or []) or "None"
        founder_library_block = (
            f"FOUNDER LIBRARY CONTEXT\n{founder_library_context}"
            if founder_library_context
            else ""
        )
        return f"""
Generate a complete {doc_type} for the stakeholder type: {stakeholder}.
{PromptBuilder._mode_block(llm_mode, thinking_instructions)}

ALLOWED DOC TYPES IN THIS APP:
{allowed_doc_types}

ALLOWED STAKEHOLDERS IN THIS APP:
{allowed_stakeholders}

{guidance}

{founder_library_block}

CONTEXT PROVIDED BY THE TEAM MEMBER:
{context_lines}

Write the full document in Shreya and Sharadd's voice following all brand guidelines.
Respond ONLY with the document text — no preamble, no JSON, no markdown fences.
""".strip()

    @staticmethod
    def refine_draft(
        content: str,
        action: str,
        doc_type: str,
        stakeholder: str,
        guidance: str,
        thinking_instructions: str | None = None,
    ) -> str:
        action_instructions = {
            "shorter": "Rewrite the document to be 30-40% shorter while keeping all key information.",
            "more_formal": "Rewrite with a more formal tone appropriate for senior stakeholders.",
            "warmer": "Rewrite with a warmer, more empathetic tone while keeping authority.",
            "add_urgency": "Add a compelling urgency element (deadline, scarcity, opportunity cost) appropriate for this document type.",
            "regenerate": "Generate a completely fresh alternative version of this document.",
        }

        is_style_rewrite = action in action_instructions

        if is_style_rewrite:
            instruction = action_instructions[action]
            thinking_block = f"\n\nUSER THINKING INSTRUCTIONS\n{thinking_instructions.strip()}" if thinking_instructions else ""
            return f"""
{instruction}

DOCUMENT TYPE: {doc_type}
STAKEHOLDER: {stakeholder}
{guidance}
{thinking_block}

ORIGINAL DOCUMENT:
---
{content}
---

Respond ONLY with the revised document text — no preamble, no JSON, no markdown fences.
""".strip()
        else:
            # Guided / chat refinement — SURGICAL EDIT ONLY
            thinking_block = f"\n\nADDITIONAL THINKING INSTRUCTIONS:\n{thinking_instructions.strip()}" if thinking_instructions else ""
            return f"""
You are making a SURGICAL EDIT to an existing document. Your job is to apply ONLY the specific change requested by the user. Nothing else.

CRITICAL RULES — MUST FOLLOW EXACTLY:
1. PRESERVE every word, sentence, and paragraph that is NOT directly affected by the change.
2. Do NOT rephrase, improve, shorten, or rewrite any other part of the document.
3. Do NOT add, remove, or reorder any content beyond what is explicitly requested.
4. Do NOT change the tone, style, or structure of unaffected sections.
5. If the user says "add X", add only X in the most logical place.
6. If the user says "change X to Y", change only that specific text.
7. If the user says "remove X", remove only that specific text.
8. The output must be the full document with only the minimal necessary edit applied.

USER'S REQUESTED CHANGE:
{action}
{thinking_block}

ORIGINAL DOCUMENT (reproduce it exactly, with only the minimal edit applied):
---
{content}
---

Respond ONLY with the complete updated document text — no preamble, no explanation, no JSON, no markdown fences.
""".strip()

    @staticmethod
    def rejection_note(scorecard: dict, doc_type: str, member_name: str, founder_name: str) -> str:
        return f"""
Generate a concise, constructive rejection note for a team member named {member_name} whose {doc_type} document
received this AI scorecard:

{json.dumps(scorecard, indent=2)}

The note must:
- Be warm but direct
- Name the 2-3 most important things to fix
- Reference specific Lyfshilp brand guidelines (e.g. missing Stanford Seed credential, salesy opener, wrong tone for stakeholder)
- End with an encouraging sentence
- Address the team member directly with "Hi {member_name}"
- Sign off naturally as "{founder_name}" at the end
- NEVER output generic template brackets or placeholder fields. Use the exact names provided.

Keep it under 100 words. Respond ONLY with the note text.
""".strip()

    @staticmethod
    def library_intake(
        content_markdown: str,
        *,
        file_name: str | None = None,
        mime_type: str | None = None,
        title: str | None = None,
        description: str | None = None,
        section_key: str | None = None,
        section_label: str | None = None,
        applies_to_doc_types: list[str] | None = None,
        applies_to_stakeholders: list[str] | None = None,
        tags: list[str] | None = None,
        founder_instructions: str | None = None,
        auto_only: bool = False,
        conversation_history: list[dict] | None = None,
        available_doc_types: list[str] | None = None,
        available_stakeholders: list[str] | None = None,
    ) -> str:
        provided = {
            "title": title,
            "description": description,
            "section_key": section_key,
            "section_label": section_label,
            "applies_to_doc_types": applies_to_doc_types or [],
            "applies_to_stakeholders": applies_to_stakeholders or [],
            "tags": tags or [],
        }
        history = conversation_history or []
        history_lines = []
        for message in history[-12:]:
            role = str(message.get("role", "unknown")).upper()
            content = str(message.get("content", "")).strip()
            if not content:
                continue
            history_lines.append(f"{role}: {content}")
        history_block = "\n".join(history_lines)
        allowed_doc_types = available_doc_types or []
        allowed_stakeholders = available_stakeholders or []
        return f"""
You are classifying a founder-uploaded source for the Founder Library.

Your job:
1. Read the content and identify what kind of source this is.
2. Suggest the best metadata so the app can store it in the right library section.
3. If there is not enough information to classify safely, ask up to 3 concise clarifying questions.
4. Prefer founder-provided metadata when it is already supplied and sensible.
5. If founder instructions are provided, follow them as the highest-priority guidance unless they conflict with safety or formatting rules.
6. If founder instructions say "all stakeholders", "all doc types", "everyone", "global", or similar, expand to the full allowed list instead of picking a subset.
7. Never invent stakeholder or doc-type values outside the allowed lists.

FOUNDERS' INPUT METADATA:
{json.dumps(provided, indent=2)}

ALLOWED DOC TYPES IN THIS APP:
{json.dumps(allowed_doc_types, indent=2)}

ALLOWED STAKEHOLDERS IN THIS APP:
{json.dumps(allowed_stakeholders, indent=2)}

LLM MODE:
{("AUTO_ONLY" if auto_only else "GUIDED")}

FOUNDER INSTRUCTIONS:
{founder_instructions or ""}

CONVERSATION HISTORY:
{history_block or "None"}

FILE DETAILS:
- filename: {file_name or ""}
- mime_type: {mime_type or ""}

CONTENT:
---
{content_markdown}
---

Return ONLY valid JSON with this exact structure:
{{
  "content_kind": "short label such as proof_point, policy, outreach, program_brief, school_credential, internal_note, faq, proposal, or other",
  "summary": "1-3 sentence plain-English summary",
  "confidence": 0.0,
  "inferred_title": "short title for this item",
  "inferred_section_key": "snake_case_section_key",
  "inferred_section_label": "human readable section label",
  "recommended_doc_types": ["proposal", "whatsapp"],
  "recommended_stakeholders": ["parent", "principal"],
  "recommended_tags": ["tag1", "tag2"],
  "clarifying_questions": ["question 1", "question 2"],
  "needs_clarification": false,
  "notes": "optional extra guidance for the founder"
}}

Rules:
- Use lower_snake_case for section_key.
- Use concise labels and avoid overfitting.
- If the item clearly belongs under the founder library with no ambiguity, set needs_clarification to false and keep clarifying_questions empty.
- If the source file type and content seem mismatched, mention it in notes.
- Only recommend doc types and stakeholders from the allowed lists above.
- If the founder says "all stakeholders" or "all doc types", expand to the full allowed list instead of inventing new categories.
- If the founder explicitly requests "all stakeholders" or "all doc types", return the complete allowed list for that field, not a partial subset.
- IMPORTANT: If the founder explicitly instructs you not to change certain fields, or if the provided input metadata is completely acceptable, you MUST return null (for strings) or empty arrays (for lists) for those inferred fields so they are preserved. Do not simply echo back the input values.
""".strip()


# ---------------------------------------------------------------------------
# AI Service class
# ---------------------------------------------------------------------------

class AIService:
    """Wraps OpenAI API calls with structured input/output handling."""

    def __init__(self, system_prompt: Optional[str] = None, trace: dict[str, Any] | None = None) -> None:
        self._client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        self._system_prompt = system_prompt or DEFAULT_SYSTEM_PROMPT
        self._trace = trace

    # ── Public interface ──────────────────────────────────────────────────────

    async def review_document(
        self,
        content: str,
        doc_type: str,
        stakeholder: Stakeholder,
        guidance: str,
    ) -> AIScorecardResponse:
        prompt = PromptBuilder.review(content, doc_type, stakeholder.value, guidance)
        raw = await self._call(prompt, operation="review_document")
        return self._parse_scorecard(raw)

    async def generate_draft(
        self,
        doc_type: str,
        stakeholder: Stakeholder,
        context: dict,
        guidance: str,
        llm_mode: str = "guided",
        thinking_instructions: str | None = None,
        available_doc_types: list[str] | None = None,
        available_stakeholders: list[str] | None = None,
    ) -> str:
        prompt = PromptBuilder.generate_draft(
            doc_type,
            stakeholder.value,
            context,
            guidance,
            llm_mode=llm_mode,
            thinking_instructions=thinking_instructions,
            available_doc_types=available_doc_types,
            available_stakeholders=available_stakeholders,
        )
        logger.info("================ AI DRAFT GENERATION PROMPT ================")
        user_prompt = context.get("User's Complete Custom Prompt", "")
        if "@[" in user_prompt:
            logger.info("✅ SUCCESS: Detected Library Tags in user prompt!")
            logger.info("User prompt to LLM: %s", user_prompt)
            logger.info("Library Guidance Context injected into LLM payload:")
            logger.info("--------------------------------------------------")
            logger.info(guidance)
            logger.info("--------------------------------------------------")
        else:
            logger.info("No explicit library tags detected in prompt.")
        logger.info("============================================================")

        return await self._call(prompt, operation="generate_draft")

    async def refine_draft(self, request: RefineDraftRequest, guidance: str) -> str:
        prompt = PromptBuilder.refine_draft(
            request.content,
            request.action,
            request.doc_type,
            request.stakeholder.value,
            guidance,
            thinking_instructions=request.thinking_instructions,
        )
        return await self._call(prompt, operation="refine_draft")

    async def generate_rejection_note(
        self,
        scorecard: dict,
        doc_type: str,
        member_name: str,
        founder_name: str,
    ) -> str:
        prompt = PromptBuilder.rejection_note(scorecard, doc_type, member_name, founder_name)
        return await self._call(prompt, operation="generate_rejection_note")

    async def analyze_library_intake(
        self,
        content_markdown: str,
        *,
        file_name: str | None = None,
        mime_type: str | None = None,
        title: str | None = None,
        description: str | None = None,
        section_key: str | None = None,
        section_label: str | None = None,
        applies_to_doc_types: list[str] | None = None,
        applies_to_stakeholders: list[str] | None = None,
        tags: list[str] | None = None,
        founder_instructions: str | None = None,
        auto_only: bool = False,
        conversation_history: list[dict] | None = None,
        available_doc_types: list[str] | None = None,
        available_stakeholders: list[str] | None = None,
    ) -> KnowledgeLibraryAnalysis:
        prompt = PromptBuilder.library_intake(
            content_markdown,
            file_name=file_name,
            mime_type=mime_type,
            title=title,
            description=description,
            section_key=section_key,
            section_label=section_label,
            applies_to_doc_types=applies_to_doc_types,
            applies_to_stakeholders=applies_to_stakeholders,
            tags=tags,
            founder_instructions=founder_instructions,
            auto_only=auto_only,
            conversation_history=conversation_history,
            available_doc_types=available_doc_types,
            available_stakeholders=available_stakeholders,
        )
        raw = await self._call(prompt, operation="analyze_library_intake")
        clean = raw.strip().removeprefix("```json").removesuffix("```").strip()
        data = json.loads(clean)
        return KnowledgeLibraryAnalysis(**data)

    # ── Private helpers ───────────────────────────────────────────────────────

    async def _call(self, user_prompt: str, *, operation: str) -> str:
        if self._trace is not None:
            append_ai_call(
                self._trace,
                operation=operation,
                model=settings.OPENAI_MODEL,
                system_prompt=self._system_prompt,
                user_prompt=user_prompt,
            )
        try:
            response = await self._client.chat.completions.create(
                model=settings.OPENAI_MODEL,
                max_completion_tokens=settings.OPENAI_MAX_TOKENS,
                messages=[
                    {"role": "system", "content": self._system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
            )
            content = response.choices[0].message.content
            if not content:
                raise AIServiceError("AI returned an empty response.")
            return content.strip()
        except BadRequestError as exc:
            logger.error(
                "OpenAI API bad request",
                extra={"model": settings.OPENAI_MODEL, "error": str(exc)},
            )
            raise AIServiceError(self._format_bad_request_message(exc)) from exc
        except Exception as exc:
            logger.error(
                "OpenAI API error",
                extra={"model": settings.OPENAI_MODEL, "error": str(exc)},
            )
            raise AIServiceError(f"AI service error: {exc}") from exc

    @staticmethod
    def _format_bad_request_message(exc: BadRequestError) -> str:
        message = str(exc)
        message_lower = message.lower()
        model = settings.OPENAI_MODEL

        if "max_tokens" in message_lower and "not compatible" in message_lower:
            return (
                f"AI service error: model '{model}' rejected the legacy max_tokens parameter. "
                "Use max_completion_tokens or switch to a model compatible with the current request shape."
            )

        if "model" in message_lower and (
            "does not exist" in message_lower
            or "not found" in message_lower
            or "unsupported" in message_lower
        ):
            return (
                f"AI service error: model '{model}' is unavailable or invalid for this API key/project. "
                "Choose a model ID that exists in your OpenAI account and is supported by the Chat Completions API."
            )

        return f"AI service error: {message}"

    @staticmethod
    def _parse_scorecard(raw: str) -> AIScorecardResponse:
        """Parse JSON scorecard response from the model."""
        try:
            # Strip markdown fences if the model adds them despite instructions
            clean = raw.strip().removeprefix("```json").removesuffix("```").strip()
            data = json.loads(clean)
            return AIScorecardResponse(**data)
        except (json.JSONDecodeError, ValueError, KeyError) as exc:
            logger.error("Failed to parse AI scorecard", extra={"raw": raw[:500]})
            raise AIServiceError("AI returned an unparseable scorecard.") from exc

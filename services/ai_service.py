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

from openai import AsyncOpenAI

from core.config import settings
from core.exceptions import AIServiceError
from core.logging import get_logger
from models.models import Stakeholder
from pipeline.tracing import append_ai_call
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
- Proposals, Cold Emails, Reply Emails, LinkedIn, Payment Follow-ups: NEVER use emoji.
- WhatsApp to Parents: max 1-2 emoji only for warmth (e.g. ⭐ ✅).
- WhatsApp to Students: max 2-3 emoji, never mid-sentence.
- WhatsApp to Principals: avoid emoji.
- Ad Creative: context-dependent; only if platform calls for it.
- Emoji go at the start of a bullet or line, never mid-sentence or after a full stop.
""".strip()


# ---------------------------------------------------------------------------
# Prompts factory
# ---------------------------------------------------------------------------

class PromptBuilder:
    """Builds structured prompts for each AI task."""

    @staticmethod
    def review(content: str, doc_type: str, stakeholder: str, guidance: str) -> str:
        return f"""
Review the following document for Lyfshilp Academy.

DOCUMENT TYPE: {doc_type}
STAKEHOLDER: {stakeholder}
{guidance}

DOCUMENT CONTENT:
---
{content}
---

Score this document across 5 dimensions (20 points each = 100 total):
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
""".strip()

    @staticmethod
    def generate_draft(doc_type: str, stakeholder: str, context: dict, guidance: str) -> str:
        context_lines = "\n".join(f"- {k}: {v}" for k, v in context.items())
        return f"""
Generate a complete {doc_type} for the stakeholder type: {stakeholder}.
{guidance}

CONTEXT PROVIDED BY THE TEAM MEMBER:
{context_lines}

Write the full document in Shreya and Sharadd's voice following all brand guidelines.
Respond ONLY with the document text — no preamble, no JSON, no markdown fences.
""".strip()

    @staticmethod
    def refine_draft(content: str, action: str, doc_type: str, stakeholder: str, guidance: str) -> str:
        action_instructions = {
            "shorter": "Rewrite the document to be 30-40% shorter while keeping all key information.",
            "more_formal": "Rewrite with a more formal tone appropriate for senior stakeholders.",
            "warmer": "Rewrite with a warmer, more empathetic tone while keeping authority.",
            "add_urgency": "Add a compelling urgency element (deadline, scarcity, opportunity cost) appropriate for this document type.",
            "regenerate": "Generate a completely fresh alternative version of this document.",
        }
        instruction = action_instructions.get(action, "Improve this document.")
        return f"""
{instruction}

DOCUMENT TYPE: {doc_type}
STAKEHOLDER: {stakeholder}
{guidance}

ORIGINAL DOCUMENT:
---
{content}
---

Respond ONLY with the revised document text — no preamble, no JSON, no markdown fences.
""".strip()

    @staticmethod
    def rejection_note(scorecard: dict, doc_type: str) -> str:
        return f"""
Generate a concise, constructive rejection note for a team member whose {doc_type} document
received this AI scorecard:

{json.dumps(scorecard, indent=2)}

The note must:
- Be warm but direct
- Name the 2-3 most important things to fix
- Reference specific Lyfshilp brand guidelines (e.g. missing Stanford Seed credential, salesy opener, wrong tone for stakeholder)
- End with an encouraging sentence

Keep it under 100 words. Respond ONLY with the note text.
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
    ) -> str:
        prompt = PromptBuilder.generate_draft(doc_type, stakeholder.value, context, guidance)
        return await self._call(prompt, operation="generate_draft")

    async def refine_draft(self, request: RefineDraftRequest, guidance: str) -> str:
        prompt = PromptBuilder.refine_draft(
            request.content,
            request.action,
            request.doc_type,
            request.stakeholder.value,
            guidance,
        )
        return await self._call(prompt, operation="refine_draft")

    async def generate_rejection_note(self, scorecard: dict, doc_type: str) -> str:
        prompt = PromptBuilder.rejection_note(scorecard, doc_type)
        return await self._call(prompt, operation="generate_rejection_note")

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
                max_tokens=settings.OPENAI_MAX_TOKENS,
                messages=[
                    {"role": "system", "content": self._system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
            )
            content = response.choices[0].message.content
            if not content:
                raise AIServiceError("AI returned an empty response.")
            return content.strip()
        except Exception as exc:
            logger.error("OpenAI API error", extra={"error": str(exc)})
            raise AIServiceError(f"AI service error: {exc}") from exc

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

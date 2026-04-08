"""Prompt context assembly for LangGraph workflows."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from models.models import Stakeholder
from pipeline.tracing import append_db_query, set_context_block
from services.ai_review_guidance_service import AIReviewGuidanceService
from services.ai_service import AIService
from services.document_guidance_service import DocumentGuidanceService
from services.emoji_guidance_service import EmojiGuidanceService
from services.few_shot_example_service import FewShotExampleService
from services.knowledge_snippet_service import KnowledgeSnippetService
from services.knowledge_library_service import KnowledgeLibraryService
from services.stakeholder_guidance_service import StakeholderGuidanceService
from services.system_prompt_service import SystemPromptService
from pipeline.tools.submission_context_assembler import SubmissionContextAssembler


@dataclass(slots=True)
class PromptContextBundle:
    deterministic_context: str
    enrichment_context: str = ""
    library_context: str = ""
    review_context: str = ""
    trace: dict[str, Any] | None = None

    @property
    def prompt_context(self) -> str:
        return "\n\n".join(
            block
            for block in (
                self.deterministic_context,
                self.enrichment_context,
                self.library_context,
                self.review_context,
            )
            if block
        )


class SubmissionPromptContextService:
    """Build founder-managed prompt context blocks for AI workflows."""

    def __init__(self, session: AsyncSession) -> None:
        self._prompt_service = SystemPromptService(session)
        self._knowledge_snippet_service = KnowledgeSnippetService(session)
        self._knowledge_library_service = KnowledgeLibraryService(session)
        self._stakeholder_guidance_service = StakeholderGuidanceService(session)
        self._document_guidance_service = DocumentGuidanceService(session)
        self._emoji_guidance_service = EmojiGuidanceService(session)
        self._few_shot_example_service = FewShotExampleService(session)
        self._ai_review_guidance_service = AIReviewGuidanceService(session)
        self._context_assembler = SubmissionContextAssembler(
            document_guidance_service=self._document_guidance_service,
            emoji_guidance_service=self._emoji_guidance_service,
            few_shot_example_service=self._few_shot_example_service,
            ai_review_guidance_service=self._ai_review_guidance_service,
        )

    async def build_ai_service(
        self,
        stakeholder: Stakeholder | None = None,
        *,
        trace: dict[str, Any] | None = None,
    ) -> AIService:
        prompt = await self._prompt_service.ensure_seeded()
        prompt_text = prompt.prompt_text
        knowledge_snippets = await self._knowledge_snippet_service.list_active()
        knowledge_block = ""
        if knowledge_snippets:
            lines = ["ADDITIONAL KNOWLEDGE CONTEXT"]
            for snippet in knowledge_snippets:
                lines.append(f"- {snippet.title}:")
                lines.append(snippet.content)
                lines.append("")
            knowledge_block = "\n".join(lines).strip()
        if knowledge_block:
            prompt_text = f"{prompt_text}\n\n{knowledge_block}"

        stakeholder_block = ""
        if stakeholder is not None:
            guidance = await self._stakeholder_guidance_service.get_guidance(stakeholder)
            stakeholder_block = (
                "STAKEHOLDER-SPECIFIC TONE RULES\n"
                f"- Stakeholder: {guidance.title}\n"
                f"- Guidance: {guidance.guidance_text}"
            )
            prompt_text = f"{prompt_text}\n\n{stakeholder_block}"

        if trace is not None:
            append_db_query(
                trace,
                service="SystemPromptService",
                query="ensure_seeded/get_active_prompt",
                filters={"is_active": True},
                result={"id": str(prompt.id), "label": prompt.label},
            )
            set_context_block(
                trace,
                "system_prompt",
                prompt.prompt_text,
                metadata={"label": prompt.label},
            )

            append_db_query(
                trace,
                service="KnowledgeSnippetService",
                query="list_active",
                filters={"is_active": True},
                result={"count": len(knowledge_snippets)},
            )
            set_context_block(
                trace,
                "knowledge_snippets",
                knowledge_block,
                metadata={
                    "count": len(knowledge_snippets),
                    "titles": [snippet.title for snippet in knowledge_snippets],
                },
            )

            if stakeholder is not None:
                append_db_query(
                    trace,
                    service="StakeholderGuidanceService",
                    query="get_guidance",
                    filters={"stakeholder": stakeholder.value},
                    result={"title": guidance.title},
                )
                set_context_block(
                    trace,
                    "stakeholder_guidance",
                    stakeholder_block,
                    metadata={"stakeholder": stakeholder.value, "title": guidance.title},
                )

            set_context_block(trace, "assembled_system_prompt", prompt_text)

        return AIService(system_prompt=prompt_text, trace=trace)

    async def build_generation_context(
        self,
        doc_type: str,
        stakeholder: Stakeholder,
        *,
        current_department: str | None = None,
        trace: dict[str, Any] | None = None,
    ) -> PromptContextBundle:
        retrieved = await self._context_assembler.assemble(
            doc_type,
            stakeholder,
            trace=trace,
        )
        library_context = await self._knowledge_library_service.render_prompt_block(
            doc_type,
            stakeholder,
            current_department=current_department,
        )
        if trace is not None:
            append_db_query(
                trace,
                service="KnowledgeLibraryService",
                query="render_prompt_block",
                filters={"doc_type": doc_type, "stakeholder": stakeholder.value},
                result={"has_context": bool(library_context)},
            )
            set_context_block(
                trace,
                "knowledge_library",
                library_context,
                metadata={"doc_type": doc_type, "stakeholder": stakeholder.value},
            )
        return PromptContextBundle(
            deterministic_context=retrieved.deterministic_context,
            enrichment_context=retrieved.enrichment_context,
            library_context=library_context,
            trace=retrieved.trace,
        )

    async def build_review_context(
        self,
        doc_type: str,
        stakeholder: Stakeholder,
        *,
        current_department: str | None = None,
        trace: dict[str, Any] | None = None,
    ) -> PromptContextBundle:
        retrieved = await self._context_assembler.assemble(
            doc_type,
            stakeholder,
            include_review_guidance=True,
            trace=trace,
        )
        library_context = await self._knowledge_library_service.render_prompt_block(
            doc_type,
            stakeholder,
            current_department=current_department,
        )
        if trace is not None:
            append_db_query(
                trace,
                service="KnowledgeLibraryService",
                query="render_prompt_block",
                filters={"doc_type": doc_type, "stakeholder": stakeholder.value},
                result={"has_context": bool(library_context)},
            )
            set_context_block(
                trace,
                "knowledge_library",
                library_context,
                metadata={"doc_type": doc_type, "stakeholder": stakeholder.value},
            )
        return PromptContextBundle(
            deterministic_context=retrieved.deterministic_context,
            enrichment_context=retrieved.enrichment_context,
            library_context=library_context,
            review_context=retrieved.review_context,
            trace=retrieved.trace,
        )

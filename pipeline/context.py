"""Prompt context assembly for LangGraph workflows."""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from models.models import Stakeholder
from services.ai_review_guidance_service import AIReviewGuidanceService
from services.ai_service import AIService
from services.document_guidance_service import DocumentGuidanceService
from services.emoji_guidance_service import EmojiGuidanceService
from services.few_shot_example_service import FewShotExampleService
from services.knowledge_snippet_service import KnowledgeSnippetService
from services.stakeholder_guidance_service import StakeholderGuidanceService
from services.system_prompt_service import SystemPromptService
from pipeline.tools.rag import SubmissionContextRetriever


@dataclass(slots=True)
class PromptContextBundle:
    deterministic_context: str
    enrichment_context: str = ""
    review_context: str = ""

    @property
    def prompt_context(self) -> str:
        return "\n\n".join(
            block
            for block in (
                self.deterministic_context,
                self.enrichment_context,
                self.review_context,
            )
            if block
        )


class SubmissionPromptContextService:
    """Build founder-managed prompt context blocks for AI workflows."""

    def __init__(self, session: AsyncSession) -> None:
        self._prompt_service = SystemPromptService(session)
        self._knowledge_snippet_service = KnowledgeSnippetService(session)
        self._stakeholder_guidance_service = StakeholderGuidanceService(session)
        self._document_guidance_service = DocumentGuidanceService(session)
        self._emoji_guidance_service = EmojiGuidanceService(session)
        self._few_shot_example_service = FewShotExampleService(session)
        self._ai_review_guidance_service = AIReviewGuidanceService(session)
        self._context_retriever = SubmissionContextRetriever(
            document_guidance_service=self._document_guidance_service,
            emoji_guidance_service=self._emoji_guidance_service,
            few_shot_example_service=self._few_shot_example_service,
            ai_review_guidance_service=self._ai_review_guidance_service,
        )

    async def build_ai_service(self, stakeholder: Stakeholder | None = None) -> AIService:
        prompt_text = await self._prompt_service.get_active_prompt_text()
        knowledge_block = await self._knowledge_snippet_service.render_prompt_block()
        if knowledge_block:
            prompt_text = f"{prompt_text}\n\n{knowledge_block}"
        if stakeholder is not None:
            stakeholder_block = await self._stakeholder_guidance_service.render_guidance_block(
                stakeholder
            )
            prompt_text = f"{prompt_text}\n\n{stakeholder_block}"
        return AIService(system_prompt=prompt_text)

    async def build_generation_context(
        self,
        doc_type: str,
        stakeholder: Stakeholder,
    ) -> PromptContextBundle:
        retrieved = await self._context_retriever.retrieve(
            doc_type,
            stakeholder,
        )
        return PromptContextBundle(
            deterministic_context=retrieved.deterministic_context,
            enrichment_context=retrieved.enrichment_context,
        )

    async def build_review_context(
        self,
        doc_type: str,
        stakeholder: Stakeholder,
    ) -> PromptContextBundle:
        retrieved = await self._context_retriever.retrieve(
            doc_type,
            stakeholder,
            include_review_guidance=True,
        )
        return PromptContextBundle(
            deterministic_context=retrieved.deterministic_context,
            enrichment_context=retrieved.enrichment_context,
            review_context=retrieved.review_context,
        )

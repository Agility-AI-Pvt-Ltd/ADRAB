"""Deterministic retrieval and context enrichment for submission workflows."""

from __future__ import annotations

from dataclasses import dataclass

from models.models import Stakeholder
from services.ai_review_guidance_service import AIReviewGuidanceService
from services.document_guidance_service import DocumentGuidanceService
from services.emoji_guidance_service import EmojiGuidanceService
from services.few_shot_example_service import FewShotExampleService


@dataclass(slots=True)
class RetrievedSubmissionContext:
    deterministic_context: str
    enrichment_context: str = ""
    review_context: str = ""


class SubmissionContextRetriever:
    """Collect the founder-defined context blocks used by the graph."""

    def __init__(
        self,
        document_guidance_service: DocumentGuidanceService,
        emoji_guidance_service: EmojiGuidanceService,
        few_shot_example_service: FewShotExampleService,
        ai_review_guidance_service: AIReviewGuidanceService,
    ) -> None:
        self._document_guidance_service = document_guidance_service
        self._emoji_guidance_service = emoji_guidance_service
        self._few_shot_example_service = few_shot_example_service
        self._ai_review_guidance_service = ai_review_guidance_service

    async def retrieve(
        self,
        doc_type: str,
        stakeholder: Stakeholder,
        *,
        include_review_guidance: bool = False,
    ) -> RetrievedSubmissionContext:
        document_guidance = await self._document_guidance_service.render_guidance_block(doc_type)
        emoji_guidance = await self._emoji_guidance_service.render_guidance_block(
            doc_type,
            stakeholder,
        )
        few_shot_examples = await self._few_shot_example_service.render_examples_block(
            doc_type,
            stakeholder,
        )
        review_guidance = ""
        if include_review_guidance:
            review_guidance = await self._ai_review_guidance_service.render_guidance_block()

        return RetrievedSubmissionContext(
            deterministic_context="\n\n".join(
                block for block in (document_guidance, emoji_guidance) if block
            ),
            enrichment_context=few_shot_examples,
            review_context=review_guidance,
        )

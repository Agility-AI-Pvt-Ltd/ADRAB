"""Deterministic prompt context assembly for submission workflows."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from models.models import Stakeholder
from pipeline.tracing import append_db_query, set_context_block, set_few_shot_examples
from services.ai_review_guidance_service import AIReviewGuidanceService
from services.document_guidance_service import DocumentGuidanceService
from services.emoji_guidance_service import EmojiGuidanceService
from services.few_shot_example_service import FewShotExampleService


@dataclass(slots=True)
class RetrievedSubmissionContext:
    deterministic_context: str
    enrichment_context: str = ""
    review_context: str = ""
    trace: dict[str, Any] | None = None


class SubmissionContextAssembler:
    """Collect the founder-managed context blocks used by the workflow."""

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

    async def assemble(
        self,
        doc_type: str,
        stakeholder: Stakeholder,
        *,
        include_review_guidance: bool = False,
        trace: dict[str, Any] | None = None,
    ) -> RetrievedSubmissionContext:
        document_row = await self._document_guidance_service.get_guidance(doc_type)
        document_guidance = (
            f"DOCUMENT TYPE GUIDANCE\n"
            f"- Type: {document_row.title}\n"
            f"- Description: {document_row.description}\n"
            f"- Key Requirements: {document_row.key_requirements}"
        )

        emoji_rows = await self._emoji_guidance_service.resolve_guidance_rows(
            doc_type,
            stakeholder,
        )
        emoji_guidance = ""
        if emoji_rows:
            emoji_guidance = "EMOJI USAGE RULES\n" + "\n\n".join(
                f"{row.title}\n{row.content}" for row in emoji_rows
            )

        examples = await self._few_shot_example_service.list_examples(doc_type, stakeholder)
        few_shot_examples = ""
        if examples:
            rendered_examples: list[str] = []
            for index, example in enumerate(examples, start=1):
                rendered_examples.append(
                    "\n".join(
                        [
                            f"EXAMPLE {index}: {example.title}",
                            "INPUT CONTEXT:",
                            example.input_context,
                            "OUTPUT MESSAGE:",
                            example.output_text,
                        ]
                    )
                )
            few_shot_examples = (
                "FEW-SHOT EXAMPLES\n"
                "Use these examples as style and structure references when the user's context is similar. "
                "Do not copy them verbatim when details differ.\n\n"
                + "\n\n".join(rendered_examples)
            )

        review_guidance = ""
        if include_review_guidance:
            review_rows = await self._ai_review_guidance_service.list_guidance()
            review_guidance = "AI REVIEW ENGINE RULES\n" + "\n\n".join(
                f"REVIEW DIMENSION: {row.review_dimension}\nSECTION: {row.title}\n{row.content}"
                for row in review_rows
            )
        else:
            review_rows = []

        if trace is not None:
            append_db_query(
                trace,
                service="DocumentGuidanceService",
                query="get_guidance",
                filters={"doc_type": doc_type},
                result={"id": str(document_row.id), "title": document_row.title},
            )
            set_context_block(
                trace,
                "document_guidance",
                document_guidance,
                metadata={"doc_type": document_row.doc_type, "title": document_row.title},
            )

            append_db_query(
                trace,
                service="EmojiGuidanceService",
                query="resolve_guidance_rows",
                filters={"doc_type": doc_type, "stakeholder": stakeholder.value},
                result={"count": len(emoji_rows), "keys": [row.config_key for row in emoji_rows]},
            )
            set_context_block(
                trace,
                "emoji_guidance",
                emoji_guidance,
                metadata={"count": len(emoji_rows)},
            )

            append_db_query(
                trace,
                service="FewShotExampleService",
                query="list_examples",
                filters={"doc_type": doc_type, "stakeholder": stakeholder.value, "active_only": True},
                result={"count": len(examples)},
            )
            set_context_block(
                trace,
                "few_shot_examples",
                few_shot_examples,
                metadata={"count": len(examples)},
            )
            set_few_shot_examples(
                trace,
                [
                    {
                        "id": str(example.id),
                        "title": example.title,
                        "doc_type": example.doc_type,
                        "stakeholder": example.stakeholder.value,
                        "sort_order": example.sort_order,
                    }
                    for example in examples
                ],
            )

            if include_review_guidance:
                append_db_query(
                    trace,
                    service="AIReviewGuidanceService",
                    query="list_guidance",
                    filters={},
                    result={"count": len(review_rows), "keys": [row.config_key for row in review_rows]},
                )
                set_context_block(
                    trace,
                    "review_guidance",
                    review_guidance,
                    metadata={"count": len(review_rows)},
                )

        return RetrievedSubmissionContext(
            deterministic_context="\n\n".join(
                block for block in (document_guidance, emoji_guidance) if block
            ),
            enrichment_context=few_shot_examples,
            review_context=review_guidance,
            trace=trace,
        )

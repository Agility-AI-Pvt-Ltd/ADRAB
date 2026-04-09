"""
AI Review Guidance Service
Stores founder-editable AI review engine rules in PostgreSQL.
"""

from typing import Dict, List

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from core.exceptions import NotFoundError
from models.models import AIReviewGuidance, User
from schemas.admin import AIReviewGuidanceUpdate

DEFAULT_AI_REVIEW_GUIDANCE: Dict[str, dict[str, str]] = {
    "tone_voice_match": {
        "review_dimension": "Tone & Voice Match",
        "title": "Lyfshilp Voice Check",
        "content": (
            "Check whether the document sounds like Lyfshilp Academy in Shreya and Sharadd's voice. "
            "It should feel warm-authoritative, not salesy, and should use the correct formality for the chosen stakeholder."
        ),
    },
    "format_structure": {
        "review_dimension": "Format & Structure",
        "title": "Document Structure Check",
        "content": (
            "Check whether the selected document type follows its expected structure, "
            "such as Hook → Proof → CTA for emails or clear sections for proposals and agreements."
        ),
    },
    "stakeholder_alignment": {
        "review_dimension": "Stakeholder Alignment",
        "title": "Audience Fit",
        "content": (
            "Check whether the language is appropriate for the selected stakeholder and whether the relevant audience dos and don'ts are respected."
        ),
    },
    "missing_information": {
        "review_dimension": "Missing Information",
        "title": "Required Elements Check",
        "content": (
            "Check whether the document includes required elements such as credibility markers, CTA, contact details, links, pricing, and dates where applicable."
        ),
    },
    "improvement_suggestions": {
        "review_dimension": "Improvement Suggestions",
        "title": "Inline Rewrite Suggestions",
        "content": (
            "Generate specific line-level rewrite suggestions that can be shown inline rather than generic comments."
        ),
    },
    "scoring_model": {
        "review_dimension": "Scoring",
        "title": "AI Scoring",
        "content": (
            "Each document receives an overall score out of 100 broken into the 5 dimensions above, with 20 points per dimension. "
            "A suggested rewrite must always be generated regardless of score."
        ),
    },
    "score_range_85_100": {
        "review_dimension": "Score Interpretation",
        "title": "85-100",
        "content": "Strong. Likely approve as-is or with minor edits.",
    },
    "score_range_65_84": {
        "review_dimension": "Score Interpretation",
        "title": "65-84",
        "content": "Good foundation. AI has suggestions and founders decide which to accept.",
    },
    "score_range_40_64": {
        "review_dimension": "Score Interpretation",
        "title": "40-64",
        "content": "Needs work. AI rewrite is recommended before founders edit.",
    },
    "score_range_0_39": {
        "review_dimension": "Score Interpretation",
        "title": "0-39",
        "content": "Poor. Reject with AI-generated feedback. Team must resubmit.",
    },
}

GUIDANCE_DISPLAY_ORDER: list[str] = [
    "tone_voice_match",
    "format_structure",
    "stakeholder_alignment",
    "missing_information",
    "improvement_suggestions",
    "scoring_model",
    "score_range_85_100",
    "score_range_65_84",
    "score_range_40_64",
    "score_range_0_39",
]


class AIReviewGuidanceService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def ensure_schema(self) -> None:
        await self._session.execute(
            text(
                """
                ALTER TABLE ai_review_guidance
                ADD COLUMN IF NOT EXISTS review_dimension VARCHAR(150)
                """
            )
        )

    async def ensure_seeded(self) -> None:
        await self.ensure_schema()
        for config_key, payload in DEFAULT_AI_REVIEW_GUIDANCE.items():
            stmt = select(AIReviewGuidance).where(AIReviewGuidance.config_key == config_key)
            result = await self._session.execute(stmt)
            existing = result.scalar_one_or_none()
            if existing is None:
                self._session.add(
                    AIReviewGuidance(
                        config_key=config_key,
                        review_dimension=payload["review_dimension"],
                        title=payload["title"],
                        content=payload["content"],
                    )
                )
            elif not existing.review_dimension:
                existing.review_dimension = payload["review_dimension"]
                self._session.add(existing)
        await self._session.flush()

    async def list_guidance(self) -> List[AIReviewGuidance]:
        await self.ensure_schema()
        stmt = select(AIReviewGuidance)
        result = await self._session.execute(stmt)
        rows = list(result.scalars().all())
        order_rank = {key: idx for idx, key in enumerate(GUIDANCE_DISPLAY_ORDER)}
        rows.sort(key=lambda row: (order_rank.get(row.config_key, len(order_rank)), row.config_key))
        return rows

    async def get_guidance(self, config_key: str) -> AIReviewGuidance:
        await self.ensure_schema()
        stmt = select(AIReviewGuidance).where(AIReviewGuidance.config_key == config_key)
        result = await self._session.execute(stmt)
        guidance = result.scalar_one_or_none()
        if guidance is None:
            await self.ensure_seeded()
            result = await self._session.execute(stmt)
            guidance = result.scalar_one_or_none()
        if guidance is None:
            raise NotFoundError(f"AI review guidance '{config_key}' not found.")
        return guidance

    async def update_guidance(self, config_key: str, data: AIReviewGuidanceUpdate, actor: User) -> AIReviewGuidance:
        guidance = await self.get_guidance(config_key)
        guidance.review_dimension = data.review_dimension
        guidance.title = data.title
        guidance.content = data.content
        guidance.updated_by = actor.id
        self._session.add(guidance)
        await self._session.flush()
        await self._session.refresh(guidance)
        return guidance

    async def render_guidance_block(self) -> str:
        await self.ensure_seeded()
        rows = await self.list_guidance()
        sections = "\n\n".join(
            f"REVIEW DIMENSION: {row.review_dimension}\nSECTION: {row.title}\n{row.content}"
            for row in rows
        )
        return f"AI REVIEW ENGINE RULES\n{sections}"

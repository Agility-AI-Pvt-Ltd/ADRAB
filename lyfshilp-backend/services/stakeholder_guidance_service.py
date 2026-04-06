"""
Stakeholder Guidance Service
Stores founder-editable stakeholder-specific tone rules in the database.
"""

from typing import Dict, List

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.exceptions import NotFoundError
from models.models import Stakeholder, StakeholderGuidance, User
from schemas.admin import StakeholderGuidanceUpdate

DEFAULT_STAKEHOLDER_GUIDANCE: Dict[Stakeholder, dict[str, str]] = {
    Stakeholder.PARENT: {
        "title": "Parents",
        "guidance_text": (
            "Warm, celebratory, child-centric language. Lead with the child's success or opportunity. "
            "Use 'your child', specific dates, and specific amounts where relevant. "
            "Use WhatsApp-friendly formatting when the channel fits. Never sound corporate."
        ),
    },
    Stakeholder.STUDENT: {
        "title": "Students",
        "guidance_text": (
            "Aspirational, empowering, peer-to-peer energy. Use outcome language such as "
            "'you will build' and 'you will learn'. Avoid jargon. Prefer short sentences. "
            "Sound exciting but credible."
        ),
    },
    Stakeholder.PRINCIPAL: {
        "title": "Principals / School HoDs",
        "guidance_text": (
            "Formal opening such as 'Respected Sir/Ma'am' or a name plus referral. Lead with insight, not product. "
            "Emphasise zero burden and NEP alignment. Include school social proof such as DPS and Mt. Carmel where relevant. "
            "End with a low-commitment ask such as a 15-minute call."
        ),
    },
    Stakeholder.COUNSELLOR: {
        "title": "Counsellors",
        "guidance_text": (
            "Peer-professional tone. Empathetic and expert. Mention student outcomes and data-backed tools. "
            "Avoid generic sales language."
        ),
    },
    Stakeholder.CORPORATE: {
        "title": "Corporates / Investors",
        "guidance_text": (
            "Data-first. Use specific numbers such as revenue or growth percentage where available. "
            "Respect their time with direct phrasing. Make a direct ask. No fluff."
        ),
    },
    Stakeholder.INVESTOR: {
        "title": "Corporates / Investors",
        "guidance_text": (
            "Data-first. Use specific numbers such as revenue or growth percentage where available. "
            "Respect their time with direct phrasing. Make a direct ask. No fluff."
        ),
    },
    Stakeholder.GOVERNMENT: {
        "title": "Government / Dept. Officials",
        "guidance_text": (
            "Formal and respectful. Lead with mission alignment. Reference credentials such as DPIIT and IIIT Allahabad. "
            "Offer to work around their schedule. Keep the note structured, serious, and concise."
        ),
    },
}


class StakeholderGuidanceService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def ensure_seeded(self) -> None:
        for stakeholder, payload in DEFAULT_STAKEHOLDER_GUIDANCE.items():
            stmt = select(StakeholderGuidance).where(StakeholderGuidance.stakeholder == stakeholder)
            result = await self._session.execute(stmt)
            existing = result.scalar_one_or_none()
            if existing is None:
                self._session.add(
                    StakeholderGuidance(
                        stakeholder=stakeholder,
                        title=payload["title"],
                        guidance_text=payload["guidance_text"],
                    )
                )
        await self._session.flush()

    async def list_guidance(self) -> List[StakeholderGuidance]:
        stmt = select(StakeholderGuidance).order_by(StakeholderGuidance.stakeholder.asc())
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def get_guidance(self, stakeholder: Stakeholder) -> StakeholderGuidance:
        stmt = select(StakeholderGuidance).where(StakeholderGuidance.stakeholder == stakeholder)
        result = await self._session.execute(stmt)
        guidance = result.scalar_one_or_none()
        if guidance is None:
            await self.ensure_seeded()
            result = await self._session.execute(stmt)
            guidance = result.scalar_one_or_none()
        if guidance is None:
            raise NotFoundError(f"Stakeholder guidance for '{stakeholder.value}' not found.")
        return guidance

    async def update_guidance(
        self,
        stakeholder: Stakeholder,
        data: StakeholderGuidanceUpdate,
        actor: User,
    ) -> StakeholderGuidance:
        guidance = await self.get_guidance(stakeholder)
        guidance.title = data.title
        guidance.guidance_text = data.guidance_text
        guidance.updated_by = actor.id
        self._session.add(guidance)
        await self._session.flush()
        await self._session.refresh(guidance)
        return guidance

    async def render_guidance_block(self, stakeholder: Stakeholder) -> str:
        guidance = await self.get_guidance(stakeholder)
        return (
            "STAKEHOLDER-SPECIFIC TONE RULES\n"
            f"- Stakeholder: {guidance.title}\n"
            f"- Guidance: {guidance.guidance_text}"
        )

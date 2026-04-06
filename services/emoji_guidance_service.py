"""
Emoji Guidance Service
Stores founder-editable emoji usage rules in PostgreSQL.
"""

from typing import Dict, List

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from core.exceptions import NotFoundError
from models.models import EmojiGuidance, Stakeholder, User
from schemas.admin import EmojiGuidanceUpdate

DEFAULT_EMOJI_GUIDANCE: Dict[str, dict[str, str]] = {
    "proposals_agreements": {
        "title": "Proposals & Agreements",
        "content": "NEVER. Zero emoji. These are formal business documents.",
    },
    "cold_emails": {
        "title": "Cold Emails",
        "content": "NEVER. Professional context. Emoji make outreach look unprepared.",
    },
    "reply_emails": {
        "title": "Reply Emails",
        "content": "NEVER. Maintain the tone already set by the recipient's email.",
    },
    "linkedin_messages": {
        "title": "LinkedIn Messages",
        "content": "NEVER. LinkedIn is a professional platform. Emoji undermine credibility.",
    },
    "payment_followups": {
        "title": "Payment Follow-ups",
        "content": "NEVER. A payment request with emoji looks informal and easy to ignore.",
    },
    "whatsapp_parents": {
        "title": "WhatsApp to Parents",
        "content": "SPARINGLY. Max 1-2 per message. Use only for warmth or emphasis, never decoration.",
    },
    "whatsapp_students": {
        "title": "WhatsApp to Students",
        "content": "SPARINGLY. Max 2-3 per message for energy and relatability, never mid-sentence.",
    },
    "whatsapp_principals": {
        "title": "WhatsApp to Principals",
        "content": "AVOID. Principals are professionals and should be treated like email.",
    },
    "ad_creative_copy": {
        "title": "Ad Creative Copy",
        "content": "CONTEXT-DEPENDENT. Use only when the platform and format call for it, such as Instagram. Never in print or school circulars.",
    },
    "placement_rules": {
        "title": "Emoji Placement Rules",
        "content": (
            "Emoji must be treated like seasoning. The default is no emoji. "
            "When used, place emoji only at the start of a bullet or line, never mid-sentence or after a full stop. "
            "Never substitute emoji for words. Never use more than one emoji in the same line. "
            "Never use emoji in email subject lines. When in doubt, leave it out."
        ),
    },
}

ORDERED_KEYS = list(DEFAULT_EMOJI_GUIDANCE.keys())


class EmojiGuidanceService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def ensure_schema(self) -> None:
        await self._session.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS emoji_guidance (
                    id UUID PRIMARY KEY,
                    config_key VARCHAR(100) NOT NULL UNIQUE,
                    title VARCHAR(150) NOT NULL,
                    content TEXT NOT NULL,
                    updated_by UUID NULL REFERENCES users(id),
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
        )

    async def ensure_seeded(self) -> None:
        await self.ensure_schema()
        for config_key, payload in DEFAULT_EMOJI_GUIDANCE.items():
            stmt = select(EmojiGuidance).where(EmojiGuidance.config_key == config_key)
            result = await self._session.execute(stmt)
            existing = result.scalar_one_or_none()
            if existing is None:
                self._session.add(
                    EmojiGuidance(
                        config_key=config_key,
                        title=payload["title"],
                        content=payload["content"],
                    )
                )
        await self._session.flush()

    async def list_guidance(self) -> List[EmojiGuidance]:
        await self.ensure_seeded()
        stmt = select(EmojiGuidance)
        result = await self._session.execute(stmt)
        rows = list(result.scalars().all())
        return sorted(rows, key=lambda row: ORDERED_KEYS.index(row.config_key) if row.config_key in ORDERED_KEYS else len(ORDERED_KEYS))

    async def get_guidance(self, config_key: str) -> EmojiGuidance:
        await self.ensure_seeded()
        stmt = select(EmojiGuidance).where(EmojiGuidance.config_key == config_key)
        result = await self._session.execute(stmt)
        guidance = result.scalar_one_or_none()
        if guidance is None:
            raise NotFoundError(f"Emoji guidance '{config_key}' not found.")
        return guidance

    async def update_guidance(self, config_key: str, data: EmojiGuidanceUpdate, actor: User) -> EmojiGuidance:
        guidance = await self.get_guidance(config_key)
        guidance.title = data.title
        guidance.content = data.content
        guidance.updated_by = actor.id
        self._session.add(guidance)
        await self._session.flush()
        await self._session.refresh(guidance)
        return guidance

    async def resolve_guidance_rows(self, doc_type: str, stakeholder: Stakeholder) -> List[EmojiGuidance]:
        await self.ensure_seeded()
        keys = ["placement_rules"]

        normalized_doc_type = doc_type.lower().strip()
        if normalized_doc_type == "proposal":
            keys.append("proposals_agreements")
        elif normalized_doc_type == "cold_email":
            keys.append("cold_emails")
        elif normalized_doc_type == "reply_email":
            keys.append("reply_emails")
        elif normalized_doc_type == "linkedin":
            keys.append("linkedin_messages")
        elif normalized_doc_type == "payment_followup":
            keys.append("payment_followups")
        elif normalized_doc_type == "ad_creative":
            keys.append("ad_creative_copy")
        elif normalized_doc_type == "whatsapp":
            if stakeholder == Stakeholder.PARENT:
                keys.append("whatsapp_parents")
            elif stakeholder == Stakeholder.STUDENT:
                keys.append("whatsapp_students")
            elif stakeholder == Stakeholder.PRINCIPAL:
                keys.append("whatsapp_principals")
            else:
                keys.append("whatsapp_parents")

        rows: List[EmojiGuidance] = []
        for key in keys:
            rows.append(await self.get_guidance(key))
        return rows

    async def render_guidance_block(self, doc_type: str, stakeholder: Stakeholder) -> str:
        rows = await self.resolve_guidance_rows(doc_type, stakeholder)
        rendered = "\n\n".join(f"{row.title}\n{row.content}" for row in rows)
        return f"EMOJI USAGE RULES\n{rendered}"

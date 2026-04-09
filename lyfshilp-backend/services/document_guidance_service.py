"""
Document Guidance Service
Stores editable document-type-specific writing guidance in the database.
"""

import asyncio
from typing import Dict, List

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from core.exceptions import ConflictError, NotFoundError, ValidationError
from models.models import DocumentGuidance, User
from schemas.admin import DocumentGuidanceCreate, DocumentGuidanceUpdate

DEFAULT_DOCUMENT_GUIDANCE: Dict[str, dict[str, str]] = {
    "proposal": {
        "title": "Proposal / Agreement",
        "description": "School partnership proposals, investor decks, corporate tie-ups.",
        "key_requirements": "Must include credibility markers (Stanford Seed, DPIIT, IIIT Allahabad), structured programme sections, and a clear CTA.",
    },
    "cold_email": {
        "title": "Email - Cold Outreach",
        "description": "First-contact emails to principals, corporates, or counsellors.",
        "key_requirements": "Must open with a hook or referral name, lead with research/insight, include social proof, and end with a specific 15-min call ask.",
    },
    "reply_email": {
        "title": "Email - Reply",
        "description": "Responses to inbound queries.",
        "key_requirements": "Warm, informative, action-oriented. Never too long.",
    },
    "whatsapp": {
        "title": "WhatsApp / SMS Message",
        "description": "Short, punchy messages.",
        "key_requirements": "Emoji used sparingly and only when it adds warmth or clarity - never decoratively. Different tone for parents vs. corporates. Must include key dates, links, and a clear next step.",
    },
    "linkedin": {
        "title": "LinkedIn Message",
        "description": "Professional but warm LinkedIn outreach.",
        "key_requirements": "Credibility-first. Short - max 5 lines. Must feel personal, not templated.",
    },
    "ad_creative": {
        "title": "Ad Creative Copy",
        "description": "Headline + subtext + bullet benefits + CTA.",
        "key_requirements": "Bold, aspirational language. Harvard/Stanford/IIT references where relevant. Price and urgency included.",
    },
    "payment_followup": {
        "title": "Payment Follow-up",
        "description": "Polite but firm payment reminders.",
        "key_requirements": "References the opportunity cost of delay. Never aggressive - always respectful.",
    },
}

_HAS_SEEDED = False
_SEEDING_LOCK = asyncio.Lock()


class DocumentGuidanceService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def ensure_constraints(self) -> None:
        normalized_expr = "lower(replace(replace(trim(doc_type), '-', '_'), ' ', '_'))"

        await self._session.execute(
            text(
                f"""
                WITH ranked AS (
                    SELECT
                        id,
                        {normalized_expr} AS normalized_doc_type,
                        ROW_NUMBER() OVER (
                            PARTITION BY {normalized_expr}
                            ORDER BY
                                CASE WHEN doc_type = {normalized_expr} THEN 0 ELSE 1 END,
                                updated_at DESC,
                                created_at DESC,
                                id DESC
                        ) AS row_num
                    FROM document_guidance
                )
                DELETE FROM document_guidance AS dg
                USING ranked
                WHERE dg.id = ranked.id
                  AND ranked.row_num > 1
                """
            )
        )

        await self._session.execute(
            text(
                f"""
                UPDATE document_guidance
                SET doc_type = {normalized_expr}
                WHERE doc_type <> {normalized_expr}
                """
            )
        )

        await self._session.execute(
            text(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS uq_document_guidance_doc_type_normalized
                ON document_guidance ((lower(doc_type)))
                """
            )
        )

    async def ensure_seeded(self) -> None:
        global _HAS_SEEDED
        if _HAS_SEEDED:
            return

        async with _SEEDING_LOCK:
            if _HAS_SEEDED:
                return
            
            await self.ensure_constraints()
            for doc_type, payload in DEFAULT_DOCUMENT_GUIDANCE.items():
                stmt = select(DocumentGuidance).where(DocumentGuidance.doc_type == doc_type)
                result = await self._session.execute(stmt)
            existing = result.scalar_one_or_none()
            if existing is None:
                self._session.add(
                    DocumentGuidance(
                        doc_type=doc_type,
                        title=payload["title"],
                        description=payload["description"],
                        key_requirements=payload["key_requirements"],
                    )
                )
            await self._session.flush()
            _HAS_SEEDED = True

    async def list_guidance(self) -> List[DocumentGuidance]:
        stmt = select(DocumentGuidance).order_by(DocumentGuidance.doc_type.asc())
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    def normalize_doc_type(doc_type: str) -> str:
        value = doc_type.strip().lower().replace(" ", "_").replace("-", "_")
        if not value:
            raise ValidationError("doc_type is required.")
        return value

    async def get_guidance(self, doc_type: str) -> DocumentGuidance:
        doc_type = self.normalize_doc_type(doc_type)
        stmt = select(DocumentGuidance).where(DocumentGuidance.doc_type == doc_type)
        result = await self._session.execute(stmt)
        guidance = result.scalar_one_or_none()
        if guidance is not None:
            return guidance

        payload = DEFAULT_DOCUMENT_GUIDANCE.get(doc_type)
        if payload is None:
            raise NotFoundError(f"Document guidance for '{doc_type}' not found.")

        guidance = DocumentGuidance(
            doc_type=doc_type,
            title=payload["title"],
            description=payload["description"],
            key_requirements=payload["key_requirements"],
        )
        self._session.add(guidance)
        await self._session.flush()
        await self._session.refresh(guidance)
        return guidance

    async def create_guidance(
        self,
        data: DocumentGuidanceCreate,
        actor: User,
    ) -> DocumentGuidance:
        doc_type = self.normalize_doc_type(data.doc_type)
        stmt = select(DocumentGuidance).where(DocumentGuidance.doc_type == doc_type)
        result = await self._session.execute(stmt)
        existing = result.scalar_one_or_none()
        if existing is not None:
            raise ConflictError(f"Document guidance '{doc_type}' already exists.")

        guidance = DocumentGuidance(
            doc_type=doc_type,
            title=data.title,
            description=data.description,
            key_requirements=data.key_requirements,
            updated_by=actor.id,
        )
        self._session.add(guidance)
        await self._session.flush()
        await self._session.refresh(guidance)
        return guidance

    async def update_guidance(
        self,
        doc_type: str,
        data: DocumentGuidanceUpdate,
        actor: User,
    ) -> DocumentGuidance:
        guidance = await self.get_guidance(doc_type)
        next_doc_type = self.normalize_doc_type(data.doc_type) if data.doc_type is not None else guidance.doc_type
        if next_doc_type != guidance.doc_type:
            stmt = select(DocumentGuidance).where(DocumentGuidance.doc_type == next_doc_type)
            result = await self._session.execute(stmt)
            existing = result.scalar_one_or_none()
            if existing is not None:
                raise ConflictError(f"Document guidance '{next_doc_type}' already exists.")
            guidance.doc_type = next_doc_type
        guidance.title = data.title
        guidance.description = data.description
        guidance.key_requirements = data.key_requirements
        guidance.updated_by = actor.id
        self._session.add(guidance)
        await self._session.flush()
        await self._session.refresh(guidance)
        return guidance

    async def render_guidance_block(self, doc_type: str) -> str:
        guidance = await self.get_guidance(doc_type)
        return (
            f"DOCUMENT TYPE GUIDANCE\n"
            f"- Type: {guidance.title}\n"
            f"- Description: {guidance.description}\n"
            f"- Key Requirements: {guidance.key_requirements}"
        )

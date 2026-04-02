"""Submission Repository"""

from typing import List, Optional
from uuid import UUID

from sqlalchemy import and_, desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from db.base_repository import BaseRepository
from models.models import (
    DocumentType,
    Stakeholder,
    Submission,
    SubmissionStatus,
)


class SubmissionRepository(BaseRepository[Submission]):
    model = Submission

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session)

    async def get_with_relations(self, id: UUID) -> Optional[Submission]:
        stmt = (
            select(Submission)
            .where(Submission.id == id)
            .options(
                selectinload(Submission.author),
                selectinload(Submission.feedback),
                selectinload(Submission.visibility),
            )
        )
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_pending_for_founders(
        self,
        doc_type: Optional[DocumentType] = None,
        stakeholder: Optional[Stakeholder] = None,
        user_id: Optional[UUID] = None,
    ) -> List[Submission]:
        filters = [Submission.status == SubmissionStatus.PENDING]
        if doc_type:
            filters.append(Submission.doc_type == doc_type)
        if stakeholder:
            filters.append(Submission.stakeholder == stakeholder)
        if user_id:
            filters.append(Submission.user_id == user_id)

        stmt = (
            select(Submission)
            .where(and_(*filters))
            .options(selectinload(Submission.author))
            .order_by(desc(Submission.created_at))
        )
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def get_by_user(self, user_id: UUID) -> List[Submission]:
        stmt = (
            select(Submission)
            .where(Submission.user_id == user_id)
            .order_by(desc(Submission.created_at))
        )
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def get_version_history(self, root_id: UUID) -> List[Submission]:
        """Return all versions of a submission chain, newest first."""
        stmt = (
            select(Submission)
            .where(
                (Submission.id == root_id)
                | (Submission.parent_submission_id == root_id)
            )
            .order_by(desc(Submission.version))
        )
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def count_by_status(self) -> dict:
        from sqlalchemy import func

        stmt = select(Submission.status, func.count()).group_by(Submission.status)
        result = await self._session.execute(stmt)
        return {row[0].value: row[1] for row in result.all()}

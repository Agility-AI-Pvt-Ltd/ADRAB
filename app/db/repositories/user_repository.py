"""User Repository"""

from typing import Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base_repository import BaseRepository
from app.models.models import User


class UserRepository(BaseRepository[User]):
    model = User

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session)

    async def get_by_email(self, email: str) -> Optional[User]:
        stmt = select(User).where(User.email == email.lower())
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_google_sub(self, google_sub: str) -> Optional[User]:
        stmt = select(User).where(User.google_sub == google_sub)
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_active_users(self) -> list[User]:
        stmt = select(User).where(User.is_active.is_(True))
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

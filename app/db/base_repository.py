"""
Base Repository
Generic async CRUD operations. Domain repositories extend this class
and add business-specific queries.
"""

from typing import Any, Generic, Optional, Sequence, Type, TypeVar
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import Base

ModelT = TypeVar("ModelT", bound=Base)


class BaseRepository(Generic[ModelT]):
    """Thin ORM wrapper providing typed CRUD primitives."""

    model: Type[ModelT]

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    # ── Read ──────────────────────────────────────────────────────────────────

    async def get(self, id: UUID) -> Optional[ModelT]:
        return await self._session.get(self.model, id)

    async def get_or_raise(self, id: UUID) -> ModelT:
        from app.core.exceptions import NotFoundError

        obj = await self.get(id)
        if obj is None:
            raise NotFoundError(f"{self.model.__name__} '{id}' not found.")
        return obj

    async def all(self) -> Sequence[ModelT]:
        result = await self._session.execute(select(self.model))
        return result.scalars().all()

    async def filter_by(self, **kwargs: Any) -> Sequence[ModelT]:
        stmt = select(self.model).filter_by(**kwargs)
        result = await self._session.execute(stmt)
        return result.scalars().all()

    async def first_by(self, **kwargs: Any) -> Optional[ModelT]:
        stmt = select(self.model).filter_by(**kwargs).limit(1)
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()

    # ── Write ─────────────────────────────────────────────────────────────────

    async def create(self, obj: ModelT) -> ModelT:
        self._session.add(obj)
        await self._session.flush()  # get DB-generated values without committing
        await self._session.refresh(obj)
        return obj

    async def update(self, obj: ModelT, **fields: Any) -> ModelT:
        for key, value in fields.items():
            setattr(obj, key, value)
        self._session.add(obj)
        await self._session.flush()
        await self._session.refresh(obj)
        return obj

    async def delete(self, obj: ModelT) -> None:
        await self._session.delete(obj)
        await self._session.flush()

    async def bulk_create(self, objects: list[ModelT]) -> list[ModelT]:
        self._session.add_all(objects)
        await self._session.flush()
        return objects

"""User management endpoints (admin / founders only for most actions)"""

from typing import List
from uuid import UUID

from fastapi import APIRouter

from api.dependencies import AdminOnly, CurrentUser, DBSession, FounderOnly
from db.repositories.user_repository import UserRepository
from schemas.user import UserResponse, UserUpdate

router = APIRouter(prefix="/users", tags=["Users"])


@router.get("/", response_model=List[UserResponse], dependencies=[FounderOnly])
async def list_users(session: DBSession):
    """Founders & admins: list all active users."""
    repo = UserRepository(session)
    return await repo.get_active_users()


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(user_id: UUID, current_user: CurrentUser, session: DBSession):
    """Fetch a user by ID. Team members can only fetch themselves."""
    from core.exceptions import ForbiddenError
    from models.models import UserRole

    if current_user.role == UserRole.TEAM_MEMBER and current_user.id != user_id:
        raise ForbiddenError()
    repo = UserRepository(session)
    return await repo.get_or_raise(user_id)


@router.patch("/{user_id}", response_model=UserResponse, dependencies=[FounderOnly])
async def update_user(user_id: UUID, body: UserUpdate, session: DBSession):
    """Founders: update a user's role, department, or active status."""
    repo = UserRepository(session)
    user = await repo.get_or_raise(user_id)
    return await repo.update(user, **body.model_dump(exclude_none=True))


@router.delete("/{user_id}", status_code=204, dependencies=[AdminOnly])
async def deactivate_user(user_id: UUID, session: DBSession):
    """Admin: soft-delete (deactivate) a user account."""
    repo = UserRepository(session)
    user = await repo.get_or_raise(user_id)
    await repo.update(user, is_active=False)

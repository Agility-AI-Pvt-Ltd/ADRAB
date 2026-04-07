"""User management endpoints (admin / founders only for most actions)"""

from typing import List
from uuid import UUID

from fastapi import APIRouter, Response

from api.dependencies import AdminOnly, CurrentUser, DBSession, FounderOnly
from core.exceptions import ForbiddenError, ValidationError
from core.security import hash_password, verify_password
from db.repositories.user_repository import UserRepository
from schemas.user import (
    GoogleDriveAuthUrlResponse,
    GoogleDriveCallbackRequest,
    GoogleDriveConnectionResponse,
    GoogleDriveFileResponse,
)
from schemas.user import (
    ChangePasswordRequest,
    DeleteAccountRequest,
    SelfUserUpdate,
    UserCreate,
    UserResponse,
    UserUpdate,
)
from services.auth_service import AuthService
from services.google_drive_service import GoogleDriveService

router = APIRouter(prefix="/users", tags=["Users"])


@router.get("/", response_model=List[UserResponse], dependencies=[FounderOnly])
async def list_users(session: DBSession):
    """Founders & admins: list all users, with pending team-member approvals first."""
    repo = UserRepository(session)
    return await repo.get_all_users()


@router.post("/founders", response_model=UserResponse, status_code=201, dependencies=[FounderOnly])
async def create_founder_account(body: UserCreate, current_user: CurrentUser, session: DBSession):
    """Founder-only path to create another founder account from the dashboard."""
    service = AuthService(session)
    return await service.create_founder(body, current_user)


@router.get("/me/profile", response_model=UserResponse)
async def get_my_profile(current_user: CurrentUser):
    """Return the authenticated user's own profile."""
    return current_user


@router.get("/me/google-drive", response_model=GoogleDriveConnectionResponse)
async def get_my_google_drive(current_user: CurrentUser, session: DBSession):
    service = GoogleDriveService(session)
    return await service.get_connection_status(current_user.id)


@router.get("/me/google-drive/auth", response_model=GoogleDriveAuthUrlResponse, dependencies=[FounderOnly])
async def get_my_google_drive_auth(current_user: CurrentUser, session: DBSession):
    service = GoogleDriveService(session)
    import secrets

    state = f"drive-link:{secrets.token_urlsafe(16)}"
    return {"url": service.get_auth_url(state), "state": state}


@router.post("/me/google-drive/callback", response_model=GoogleDriveConnectionResponse, dependencies=[FounderOnly])
async def google_drive_callback(body: GoogleDriveCallbackRequest, current_user: CurrentUser, session: DBSession):
    service = GoogleDriveService(session)
    await service.connect_user(current_user=current_user, code=body.code)
    return await service.get_connection_status(current_user.id)


@router.get("/me/google-drive/files", response_model=list[GoogleDriveFileResponse], dependencies=[FounderOnly])
async def get_my_google_drive_files(
    current_user: CurrentUser,
    session: DBSession,
    q: str | None = None,
):
    service = GoogleDriveService(session)
    files = await service.list_files(current_user=current_user, query=q)
    return [
        {
            "id": item.id,
            "name": item.name,
            "mime_type": item.mime_type,
            "web_view_link": item.web_view_link,
            "modified_time": item.modified_time,
            "size_bytes": item.size_bytes,
        }
        for item in files
    ]


@router.patch("/me/profile", response_model=UserResponse)
async def update_my_profile(body: SelfUserUpdate, current_user: CurrentUser, session: DBSession):
    """Update the authenticated user's own editable profile fields."""
    repo = UserRepository(session)
    user = await repo.get_or_raise(current_user.id)
    return await repo.update(user, **body.model_dump(exclude_none=True))


@router.post("/me/change-password", response_model=UserResponse)
async def change_my_password(body: ChangePasswordRequest, current_user: CurrentUser, session: DBSession):
    """Change or set the authenticated user's password."""
    repo = UserRepository(session)
    user = await repo.get_or_raise(current_user.id)

    if user.hashed_password:
        if not body.current_password:
            raise ValidationError("current_password is required.")
        if not verify_password(body.current_password, user.hashed_password):
            raise ForbiddenError("Current password is incorrect.")

    updated = await repo.update(user, hashed_password=hash_password(body.new_password))
    return updated


@router.post("/me/delete", status_code=204)
async def delete_my_account(
    body: DeleteAccountRequest,
    current_user: CurrentUser,
    session: DBSession,
):
    """Deactivate the authenticated user's own account."""
    if body.confirm_email.lower() != current_user.email.lower():
        raise ValidationError("confirm_email does not match your account email.")

    repo = UserRepository(session)
    user = await repo.get_or_raise(current_user.id)
    if user.hashed_password:
        if not body.current_password:
            raise ValidationError("current_password is required.")
        if not verify_password(body.current_password, user.hashed_password):
            raise ForbiddenError("Current password is incorrect.")

    await repo.update(user, is_active=False)
    return Response(status_code=204)


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(user_id: UUID, current_user: CurrentUser, session: DBSession):
    """Fetch a user by ID. Team members can only fetch themselves."""
    from models.models import UserRole

    if current_user.role == UserRole.TEAM_MEMBER and current_user.id != user_id:
        raise ForbiddenError()
    repo = UserRepository(session)
    return await repo.get_or_raise(user_id)


@router.patch("/{user_id}", response_model=UserResponse, dependencies=[FounderOnly])
async def update_user(user_id: UUID, body: UserUpdate, current_user: CurrentUser, session: DBSession):
    """Founders: update a user's role, department, or active status."""
    from core.exceptions import ForbiddenError
    from models.models import UserRole

    if body.role == UserRole.FOUNDER and current_user.role != UserRole.FOUNDER:
        raise ForbiddenError("Only a founder can assign the founder role.")

    repo = UserRepository(session)
    user = await repo.get_or_raise(user_id)
    return await repo.update(user, **body.model_dump(exclude_none=True))


@router.delete("/{user_id}", status_code=204, dependencies=[AdminOnly])
async def deactivate_user(user_id: UUID, session: DBSession):
    """Admin: soft-delete (deactivate) a user account."""
    repo = UserRepository(session)
    user = await repo.get_or_raise(user_id)
    await repo.update(user, is_active=False)

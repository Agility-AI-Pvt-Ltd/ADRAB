"""
FastAPI Dependencies
Re-usable Depends() callables for:
  - DB session injection
  - Current user resolution
  - Role guards
"""

from typing import Annotated
from uuid import UUID

from fastapi import Depends, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from core.exceptions import AuthenticationError, ForbiddenError
from core.security import decode_token
from db.repositories.user_repository import UserRepository
from db.session import get_db
from models.models import User, UserRole

_bearer = HTTPBearer(auto_error=False)

# Type aliases for cleaner endpoint signatures
DBSession = Annotated[AsyncSession, Depends(get_db)]


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Security(_bearer)],
    session: DBSession,
) -> User:
    if credentials is None:
        raise AuthenticationError("No bearer token provided.")

    payload = decode_token(credentials.credentials)
    user_id_str: str | None = payload.get("sub")
    if not user_id_str:
        raise AuthenticationError("Token missing subject claim.")

    try:
        user_id = UUID(user_id_str)
    except ValueError as exc:
        raise AuthenticationError("Malformed token subject.") from exc

    repo = UserRepository(session)
    user = await repo.get(user_id)
    if user is None or not user.is_active:
        raise AuthenticationError("User not found or account is inactive.")

    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


# ── Role guards ───────────────────────────────────────────────────────────────

def require_role(*roles: UserRole):
    """Factory that returns a dependency enforcing one of the given roles."""

    async def _check(user: CurrentUser) -> User:
        if user.role not in roles:
            raise ForbiddenError(
                f"This endpoint requires one of: {[r.value for r in roles]}"
            )
        return user

    return Depends(_check)


FounderOnly = require_role(UserRole.FOUNDER, UserRole.ADMIN)
AdminOnly = require_role(UserRole.ADMIN)

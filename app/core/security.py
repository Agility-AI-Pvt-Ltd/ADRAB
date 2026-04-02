"""
Security Utilities
JWT creation/verification, password hashing, and domain enforcement.
"""

from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings
from app.core.exceptions import AuthenticationError, ForbiddenError

# ---------------------------------------------------------------------------
# Password hashing
# ---------------------------------------------------------------------------

_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain: str) -> str:
    return _pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return _pwd_context.verify(plain, hashed)


# ---------------------------------------------------------------------------
# JWT
# ---------------------------------------------------------------------------

def _build_token(data: dict[str, Any], expires_delta: timedelta) -> str:
    payload = data.copy()
    payload["exp"] = datetime.now(timezone.utc) + expires_delta
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_access_token(subject: str, extra: Optional[dict] = None) -> str:
    data: dict[str, Any] = {"sub": subject, "type": "access"}
    if extra:
        data.update(extra)
    return _build_token(data, timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))


def create_refresh_token(subject: str) -> str:
    data: dict[str, Any] = {"sub": subject, "type": "refresh"}
    return _build_token(data, timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS))


def decode_token(token: str) -> dict[str, Any]:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except JWTError as exc:
        raise AuthenticationError("Invalid or expired token") from exc


# ---------------------------------------------------------------------------
# Domain enforcement
# ---------------------------------------------------------------------------

def enforce_allowed_domain(email: str) -> None:
    """Raise ForbiddenError if the email does not belong to the whitelisted domain."""
    domain = email.split("@")[-1].lower()
    if domain != settings.ALLOWED_EMAIL_DOMAIN.lower():
        raise ForbiddenError(
            f"Only @{settings.ALLOWED_EMAIL_DOMAIN} accounts are permitted."
        )

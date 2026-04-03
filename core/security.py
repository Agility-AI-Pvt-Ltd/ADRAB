"""
Security Utilities
JWT creation/verification, password hashing, and domain enforcement.
"""


from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import bcrypt
from jose import JWTError, jwt

from core.config import settings
from core.exceptions import AuthenticationError, ForbiddenError

def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


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
    normalized_email = email.strip().lower()
    if normalized_email in settings.ALLOWED_EMAIL_EXCEPTION_LIST:
        return

    domain = normalized_email.split("@")[-1]
    if domain != settings.ALLOWED_EMAIL_DOMAIN.lower():
        raise ForbiddenError(
            f"Only @{settings.ALLOWED_EMAIL_DOMAIN} accounts and approved exception emails are permitted."
        )

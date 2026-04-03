"""
Authentication Service
Handles Google OAuth flow and email+password sign-in.
All auth logic lives here; the API layer is thin.
"""

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from core.exceptions import AuthenticationError, ConflictError, ForbiddenError
from core.logging import get_logger
from core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    enforce_allowed_domain,
    hash_password,
    verify_password,
)
from db.repositories.user_repository import UserRepository
from models.models import AuthProvider, User, UserRole
from schemas.auth import TokenResponse
from schemas.user import UserCreate

logger = get_logger(__name__)

GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"
GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"


class AuthService:
    """Orchestrates all authentication use-cases."""

    def __init__(self, session: AsyncSession) -> None:
        self._user_repo = UserRepository(session)

    # ── Email + Password ──────────────────────────────────────────────────────

    async def register(self, data: UserCreate) -> User:
        email = data.email.lower()
        enforce_allowed_domain(email)

        if data.role == UserRole.FOUNDER:
            raise ForbiddenError("Only an existing founder can create another founder account.")

        existing = await self._user_repo.get_by_email(email)
        if existing:
            raise ConflictError(f"Account with email '{email}' already exists.")

        user = User(
            name=data.name,
            email=email,
            hashed_password=hash_password(data.password),
            role=data.role,
            department=data.department,
            auth_provider=AuthProvider.LOCAL,
        )
        return await self._user_repo.create(user)

    async def login(self, email: str, password: str) -> TokenResponse:
        email = email.lower()
        enforce_allowed_domain(email)

        user = await self._user_repo.get_by_email(email)
        if not user or not user.hashed_password:
            raise AuthenticationError("Invalid credentials.")
        if not verify_password(password, user.hashed_password):
            raise AuthenticationError("Invalid credentials.")
        if not user.is_active and user.role != UserRole.TEAM_MEMBER:
            raise ForbiddenError("Your account has been deactivated.")

        logger.info("User logged in via email", extra={"user_id": str(user.id)})
        return self._issue_tokens(user)

    # ── Google OAuth ──────────────────────────────────────────────────────────

    def get_google_auth_url(self, state: str) -> str:
        """Build the Google consent-screen redirect URL."""
        params = {
            "client_id": settings.GOOGLE_CLIENT_ID,
            "redirect_uri": settings.GOOGLE_REDIRECT_URI,
            "response_type": "code",
            "scope": "openid email profile",
            "state": state,
            "access_type": "offline",
            "prompt": "select_account",
        }
        query = "&".join(f"{k}={v}" for k, v in params.items())
        return f"{GOOGLE_AUTH_URL}?{query}"

    async def handle_google_callback(self, code: str) -> TokenResponse:
        """Exchange auth code → user info → upsert user → return tokens."""
        google_tokens = await self._exchange_code(code)
        user_info = await self._fetch_google_userinfo(google_tokens["access_token"])

        email: str = user_info.get("email", "").lower()
        if not email:
            raise AuthenticationError("Google did not return an email address.")

        enforce_allowed_domain(email)

        google_sub: str = user_info["sub"]
        user = await self._user_repo.get_by_google_sub(google_sub)

        if user is None:
            # First-time Google sign-in — auto-register
            existing = await self._user_repo.get_by_email(email)
            if existing:
                # Link Google to an existing local account
                user = await self._user_repo.update(
                    existing,
                    google_sub=google_sub,
                    auth_provider=AuthProvider.GOOGLE,
                )
            else:
                user = User(
                    name=user_info.get("name", email.split("@")[0]),
                    email=email,
                    google_sub=google_sub,
                    auth_provider=AuthProvider.GOOGLE,
                    role=UserRole.TEAM_MEMBER,
                )
                user = await self._user_repo.create(user)

        if not user.is_active and user.role != UserRole.TEAM_MEMBER:
            raise ForbiddenError("Your account has been deactivated.")

        logger.info("User logged in via Google", extra={"user_id": str(user.id)})
        return self._issue_tokens(user)

    async def refresh_tokens(self, refresh_token: str) -> TokenResponse:
        payload = decode_token(refresh_token)
        if payload.get("type") != "refresh":
            raise AuthenticationError("Invalid token type.")

        user = await self._user_repo.get(payload["sub"])
        if user is None:
            raise AuthenticationError("User not found or inactive.")
        if not user.is_active and user.role != UserRole.TEAM_MEMBER:
            raise AuthenticationError("User not found or inactive.")

        return self._issue_tokens(user)

    # ── Private helpers ───────────────────────────────────────────────────────

    def _issue_tokens(self, user: User) -> TokenResponse:
        extra = {"role": user.role.value, "email": user.email}
        return TokenResponse(
            access_token=create_access_token(str(user.id), extra=extra),
            refresh_token=create_refresh_token(str(user.id)),
        )

    async def _exchange_code(self, code: str) -> dict:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                GOOGLE_TOKEN_URL,
                data={
                    "code": code,
                    "client_id": settings.GOOGLE_CLIENT_ID,
                    "client_secret": settings.GOOGLE_CLIENT_SECRET,
                    "redirect_uri": settings.GOOGLE_REDIRECT_URI,
                    "grant_type": "authorization_code",
                },
            )
        if response.status_code != 200:
            raise AuthenticationError("Failed to exchange Google auth code.")
        return response.json()

    async def _fetch_google_userinfo(self, access_token: str) -> dict:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                GOOGLE_USERINFO_URL,
                headers={"Authorization": f"Bearer {access_token}"},
            )
        if response.status_code != 200:
            raise AuthenticationError("Failed to fetch Google user info.")
        return response.json()

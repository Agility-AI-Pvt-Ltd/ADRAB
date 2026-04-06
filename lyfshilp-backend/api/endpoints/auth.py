"""Auth endpoints — login, Google OAuth, token refresh"""

import secrets

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from api.dependencies import CurrentUser, DBSession
from schemas.auth import (
    GoogleCallbackRequest,
    LoginRequest,
    PasswordResetConfirmRequest,
    PasswordResetRequest,
    PasswordResetResponse,
    RefreshRequest,
    TokenResponse,
)
from schemas.user import UserCreate, UserResponse
from services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/register", response_model=UserResponse, status_code=201)
async def register(body: UserCreate, session: DBSession):
    """
    Create a new local account (admin/seed only).
    Enforces @agilityai.in domain on the email.
    """
    service = AuthService(session)
    user = await service.register(body)
    return user


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, session: DBSession):
    """
    Email + password login.
    Only @agilityai.in addresses are accepted.
    """
    service = AuthService(session)
    return await service.login(body.email, body.password)


@router.get("/google")
async def google_redirect():
    """
    Returns the Google OAuth consent-screen URL.
    The frontend should redirect the user to this URL.
    """
    state = secrets.token_urlsafe(16)
    from core.config import settings
    from services.auth_service import AuthService

    # AuthService.get_google_auth_url is a pure method — no DB needed
    url = AuthService.__new__(AuthService).get_google_auth_url.__func__(
        AuthService, state
    )
    return {"url": url, "state": state}


@router.post("/google/callback", response_model=TokenResponse)
async def google_callback(body: GoogleCallbackRequest, session: DBSession):
    """
    Google OAuth callback.
    Receives the auth code from the frontend, exchanges it for tokens,
    validates that the email belongs to @agilityai.in, and returns JWTs.
    """
    service = AuthService(session)
    return await service.handle_google_callback(body.code)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(body: RefreshRequest, session: DBSession):
    """Exchange a refresh token for a new access + refresh token pair."""
    service = AuthService(session)
    return await service.refresh_tokens(body.refresh_token)


@router.post("/forgot-password", response_model=PasswordResetResponse)
async def forgot_password(body: PasswordResetRequest, session: DBSession):
    """
    Generate and send a password reset link if the account exists.
    Always returns a generic success response.
    """
    service = AuthService(session)
    await service.request_password_reset(body.email)
    return {"message": "If an account exists for that email, a password reset link has been sent."}


@router.post("/reset-password", response_model=PasswordResetResponse)
async def reset_password(body: PasswordResetConfirmRequest, session: DBSession):
    """
    Consume a one-time password reset token and set a new password.
    """
    service = AuthService(session)
    await service.reset_password(body.token, body.new_password)
    return {"message": "Password reset successful. You can now sign in with your new password."}


@router.get("/me", response_model=UserResponse)
async def me(current_user: CurrentUser):
    """Return the currently authenticated user's profile."""
    return current_user

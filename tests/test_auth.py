"""Tests — Authentication"""

from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from models.models import PasswordResetToken
from tests.conftest import auth_headers


@pytest.mark.asyncio
async def test_login_success(client: AsyncClient, team_member):
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "member@agilityai.in", "password": "password123"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert "refresh_token" in data


@pytest.mark.asyncio
async def test_login_wrong_password(client: AsyncClient, team_member):
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "member@agilityai.in", "password": "wrongpassword"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_login_blocked_domain(client: AsyncClient):
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "hacker@gmail.com", "password": "password123"},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_login_exception_email_allowed_but_invalid_credentials(client: AsyncClient):
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "kk612470@gmail.com", "password": "password123"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_me_endpoint(client: AsyncClient, team_member):
    resp = await client.get(
        "/api/v1/auth/me",
        headers=auth_headers(team_member),
    )
    assert resp.status_code == 200
    assert resp.json()["email"] == "member@agilityai.in"


@pytest.mark.asyncio
async def test_me_no_token(client: AsyncClient):
    resp = await client.get("/api/v1/auth/me")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_founder_can_create_founder_from_users_dashboard(client: AsyncClient, founder_user):
    resp = await client.post(
        "/api/v1/users/founders",
        json={
            "name": "Second Founder",
            "email": "second.founder@agilityai.in",
            "password": "password123",
            "department": "founders",
        },
        headers=auth_headers(founder_user),
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["role"] == "founder"
    assert data["department"] == "founders"
    assert data["is_active"] is True


@pytest.mark.asyncio
async def test_admin_cannot_create_founder_from_users_dashboard(client: AsyncClient, admin_user):
    resp = await client.post(
        "/api/v1/users/founders",
        json={
            "name": "Blocked Founder",
            "email": "blocked.founder@agilityai.in",
            "password": "password123",
            "department": "founders",
        },
        headers=auth_headers(admin_user),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_forgot_password_creates_reset_token_without_leaking_account_existence(client: AsyncClient, db_session, team_member):
    with patch(
        "services.email_service.EmailService.send_password_reset_email",
        new_callable=AsyncMock,
    ) as mocked_email:
        resp = await client.post(
            "/api/v1/auth/forgot-password",
            json={"email": "member@agilityai.in"},
        )

    assert resp.status_code == 200
    assert "If an account exists" in resp.json()["message"]
    mocked_email.assert_awaited_once()

    result = await db_session.execute(
        select(PasswordResetToken).where(PasswordResetToken.user_id == team_member.id)
    )
    token = result.scalar_one_or_none()
    assert token is not None


@pytest.mark.asyncio
async def test_reset_password_consumes_token_and_allows_login(client: AsyncClient, db_session, team_member):
    with patch(
        "services.email_service.EmailService.send_password_reset_email",
        new_callable=AsyncMock,
    ), patch("services.auth_service.secrets.token_urlsafe", return_value="known-reset-token-value-1234567890"):
        await client.post(
            "/api/v1/auth/forgot-password",
            json={"email": "member@agilityai.in"},
        )

    reset_resp = await client.post(
        "/api/v1/auth/reset-password",
        json={"token": "known-reset-token-value-1234567890", "new_password": "newpassword123"},
    )
    assert reset_resp.status_code == 200

    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "member@agilityai.in", "password": "newpassword123"},
    )
    assert login_resp.status_code == 200

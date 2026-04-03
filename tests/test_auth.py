"""Tests — Authentication"""

import pytest
from httpx import AsyncClient

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

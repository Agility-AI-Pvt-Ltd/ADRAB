"""
Pytest configuration — shared fixtures for async tests.
"""

import asyncio
from typing import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from core.config import settings
from db.session import Base, get_db
from main import app
from models.models import User, UserRole, AuthProvider
from core.security import hash_password, create_access_token

# Use a separate test database
TEST_DB_URL = settings.DATABASE_URL.replace(f"/{settings.POSTGRES_DB}", "/lyfshilp_test")

test_engine = create_async_engine(TEST_DB_URL, echo=False)
TestSessionLocal = async_sessionmaker(test_engine, expire_on_commit=False)


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="function")
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with TestSessionLocal() as session:
        yield session

    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture(scope="function")
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as c:
        yield c

    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def founder_user(db_session: AsyncSession) -> User:
    user = User(
        name="Test Founder",
        email="founder@agilityai.in",
        hashed_password=hash_password("password123"),
        role=UserRole.FOUNDER,
        auth_provider=AuthProvider.LOCAL,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def team_member(db_session: AsyncSession) -> User:
    user = User(
        name="Test Member",
        email="member@agilityai.in",
        hashed_password=hash_password("password123"),
        role=UserRole.TEAM_MEMBER,
        auth_provider=AuthProvider.LOCAL,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def admin_user(db_session: AsyncSession) -> User:
    user = User(
        name="Test Admin",
        email="admin@agilityai.in",
        hashed_password=hash_password("password123"),
        role=UserRole.ADMIN,
        auth_provider=AuthProvider.LOCAL,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def other_team_member(db_session: AsyncSession) -> User:
    user = User(
        name="Another Member",
        email="other.member@agilityai.in",
        hashed_password=hash_password("password123"),
        role=UserRole.TEAM_MEMBER,
        auth_provider=AuthProvider.LOCAL,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


def auth_headers(user: User) -> dict:
    token = create_access_token(str(user.id), extra={"role": user.role.value})
    return {"Authorization": f"Bearer {token}"}

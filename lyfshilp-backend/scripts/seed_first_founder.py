"""
Seed the very first founder account into PostgreSQL.

Usage:
  .venv/bin/python scripts/seed_first_founder.py
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.config import settings
from core.logging import get_logger
from core.security import enforce_allowed_domain, hash_password
from db.session import get_db_context, init_db
from db.repositories.user_repository import UserRepository
from models.models import AuthProvider, TeamDepartment, User, UserRole

logger = get_logger(__name__)


async def seed_first_founder(*, overwrite: bool = False) -> None:
    await init_db()

    founder_email = settings.FIRST_FOUNDER_EMAIL.lower()
    enforce_allowed_domain(founder_email)

    async with get_db_context() as session:
        repo = UserRepository(session)
        existing = await repo.get_by_email(founder_email)
        if existing is not None:
            logger.info("Bootstrap founder already exists | email=%s | role=%s", existing.email, existing.role.value)
            return

        founder = User(
            name=settings.FIRST_FOUNDER_NAME,
            email=founder_email,
            hashed_password=hash_password(settings.FIRST_FOUNDER_PASSWORD),
            role=UserRole.FOUNDER,
            department=TeamDepartment.FOUNDERS,
            auth_provider=AuthProvider.LOCAL,
            is_active=True,
        )
        await repo.create(founder)
        logger.info("Seeded bootstrap founder | email=%s", founder_email)


def main() -> None:
    asyncio.run(seed_first_founder())


if __name__ == "__main__":
    main()

"""
Seed AI review guidance records into PostgreSQL.

Usage:
  .venv/bin/python scripts/seed_ai_review_guidance.py
  .venv/bin/python scripts/seed_ai_review_guidance.py --overwrite
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from db.session import get_db_context, init_db
from services.ai_review_guidance_service import (
    AIReviewGuidanceService,
    DEFAULT_AI_REVIEW_GUIDANCE,
)


async def seed_ai_review_guidance(*, overwrite: bool) -> None:
    await init_db()

    async with get_db_context() as session:
        service = AIReviewGuidanceService(session)

        if overwrite:
            rows = await service.list_guidance()
            for row in rows:
                await session.delete(row)
            await session.flush()
            await service.ensure_seeded()
            for config_key, payload in DEFAULT_AI_REVIEW_GUIDANCE.items():
                guidance = await service.get_guidance(config_key)
                guidance.review_dimension = payload["review_dimension"]
                guidance.title = payload["title"]
                guidance.content = payload["content"]
                session.add(guidance)
            await session.flush()
        else:
            await service.ensure_seeded()

        rows = await service.list_guidance()
        print(f"Seeded {len(rows)} AI review guidance rows.")
        for row in rows:
            print(f"- {row.config_key}: {row.title}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Seed founder-editable AI review guidance into PostgreSQL.",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Replace existing AI review guidance rows with the default seed content.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    asyncio.run(seed_ai_review_guidance(overwrite=args.overwrite))


if __name__ == "__main__":
    main()

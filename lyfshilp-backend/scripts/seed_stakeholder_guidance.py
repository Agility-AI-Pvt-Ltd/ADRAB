"""
Seed stakeholder guidance records into PostgreSQL.

Usage:
  .venv/bin/python scripts/seed_stakeholder_guidance.py
  .venv/bin/python scripts/seed_stakeholder_guidance.py --overwrite
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
from services.stakeholder_guidance_service import (
    DEFAULT_STAKEHOLDER_GUIDANCE,
    StakeholderGuidanceService,
)


async def seed_stakeholder_guidance(*, overwrite: bool) -> None:
    await init_db()

    async with get_db_context() as session:
        service = StakeholderGuidanceService(session)

        if overwrite:
            await service.ensure_seeded()
            for stakeholder, payload in DEFAULT_STAKEHOLDER_GUIDANCE.items():
                guidance = await service.get_guidance(stakeholder)
                guidance.title = payload["title"]
                guidance.guidance_text = payload["guidance_text"]
                session.add(guidance)
            await session.flush()
        else:
            await service.ensure_seeded()

        rows = await service.list_guidance()
        print(f"Seeded {len(rows)} stakeholder guidance rows.")
        for row in rows:
            print(f"- {row.stakeholder.value}: {row.title}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Seed founder-editable stakeholder guidance into PostgreSQL.",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Replace existing stakeholder guidance rows with the default seed content.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    asyncio.run(seed_stakeholder_guidance(overwrite=args.overwrite))


if __name__ == "__main__":
    main()

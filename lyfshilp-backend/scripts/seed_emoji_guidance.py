"""
Seed emoji guidance records into PostgreSQL.

Usage:
  .venv/bin/python scripts/seed_emoji_guidance.py
  .venv/bin/python scripts/seed_emoji_guidance.py --overwrite
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
from services.emoji_guidance_service import DEFAULT_EMOJI_GUIDANCE, EmojiGuidanceService


async def seed_emoji_guidance(*, overwrite: bool) -> None:
    await init_db()

    async with get_db_context() as session:
        service = EmojiGuidanceService(session)

        if overwrite:
            await service.ensure_seeded()
            rows = await service.list_guidance()
            for row in rows:
                payload = DEFAULT_EMOJI_GUIDANCE.get(row.config_key)
                if payload:
                    row.title = payload["title"]
                    row.content = payload["content"]
                    session.add(row)
            await session.flush()
        else:
            await service.ensure_seeded()

        rows = await service.list_guidance()
        print(f"Seeded {len(rows)} emoji guidance rows.")
        for row in rows:
            print(f"- {row.config_key}: {row.title}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Seed founder-editable emoji guidance into PostgreSQL.",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Replace existing emoji guidance rows with the default seed content.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    asyncio.run(seed_emoji_guidance(overwrite=args.overwrite))


if __name__ == "__main__":
    main()

"""
Seed the default AI system prompt into PostgreSQL.

Usage:
  .venv/bin/python scripts/seed_system_prompt.py
  .venv/bin/python scripts/seed_system_prompt.py --overwrite
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
from services.ai_service import DEFAULT_SYSTEM_PROMPT
from services.stakeholder_guidance_service import StakeholderGuidanceService
from services.system_prompt_service import SystemPromptService


async def seed_system_prompt(*, overwrite: bool) -> None:
    await init_db()

    async with get_db_context() as session:
        await StakeholderGuidanceService(session).ensure_seeded()
        service = SystemPromptService(session)

        if overwrite:
            existing = await service.get_active_prompt()
            if existing is None:
                existing = await service.ensure_seeded()
            existing.prompt_text = DEFAULT_SYSTEM_PROMPT
            existing.label = "default (seed)"
            existing.is_active = True
            session.add(existing)
            prompt = existing
        else:
            prompt = await service.ensure_seeded()

        print("Seeded system prompt:")
        print(f"- label: {prompt.label}")
        print(f"- active: {prompt.is_active}")
        print(f"- characters: {len(prompt.prompt_text)}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Seed the founder-editable AI system prompt into PostgreSQL.",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Replace the active prompt text with the default seeded prompt.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    asyncio.run(seed_system_prompt(overwrite=args.overwrite))


if __name__ == "__main__":
    main()

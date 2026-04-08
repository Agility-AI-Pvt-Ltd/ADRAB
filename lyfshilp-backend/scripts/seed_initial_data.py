"""
Seed all core founder-managed baseline data.

Usage:
  .venv/bin/python scripts/seed_initial_data.py
  .venv/bin/python scripts/seed_initial_data.py --overwrite
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.logging import get_logger
from scripts.seed_ai_review_guidance import seed_ai_review_guidance
from scripts.seed_document_guidance import seed_document_guidance
from scripts.seed_emoji_guidance import seed_emoji_guidance
from scripts.seed_few_shot_examples import seed_few_shot_examples
from scripts.seed_first_founder import seed_first_founder
from scripts.seed_stakeholder_guidance import seed_stakeholder_guidance
from scripts.seed_system_prompt import seed_system_prompt

logger = get_logger(__name__)


async def seed_initial_data(*, overwrite: bool = False) -> None:
    seed_tasks = [
        ("seed_first_founder", seed_first_founder),
        ("seed_system_prompt", seed_system_prompt),
        ("seed_stakeholder_guidance", seed_stakeholder_guidance),
        ("seed_ai_review_guidance", seed_ai_review_guidance),
        ("seed_emoji_guidance", seed_emoji_guidance),
        ("seed_document_guidance", seed_document_guidance),
        ("seed_few_shot_examples", seed_few_shot_examples),
    ]

    for label, task in seed_tasks:
        logger.info("Running seed script: %s", label)
        await task(overwrite=overwrite)


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed Lyfshilp baseline data.")
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Overwrite existing seeded rows where supported.",
    )
    args = parser.parse_args()
    asyncio.run(seed_initial_data(overwrite=args.overwrite))


if __name__ == "__main__":
    main()

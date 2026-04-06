"""
Seed few-shot drafting examples into PostgreSQL.

Usage:
  .venv/bin/python scripts/seed_few_shot_examples.py
  .venv/bin/python scripts/seed_few_shot_examples.py --overwrite
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

from sqlalchemy import select

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from db.session import get_db_context, init_db
from models.models import FewShotExample
from services.few_shot_example_service import (
    DEFAULT_FEW_SHOT_EXAMPLES,
    FewShotExampleService,
)


async def seed_few_shot_examples(*, overwrite: bool) -> None:
    await init_db()

    async with get_db_context() as session:
        service = FewShotExampleService(session)

        if overwrite:
            for payload in DEFAULT_FEW_SHOT_EXAMPLES:
                stmt = select(FewShotExample).where(
                    FewShotExample.doc_type == str(payload["doc_type"]),
                    FewShotExample.stakeholder == payload["stakeholder"],
                    FewShotExample.title == str(payload["title"]),
                )
                result = await session.execute(stmt)
                existing = result.scalar_one_or_none()
                if existing is not None:
                    await session.delete(existing)
            await session.flush()

            for payload in DEFAULT_FEW_SHOT_EXAMPLES:
                session.add(build_model(payload=payload))
            await session.flush()
        else:
            await service.ensure_seeded()

        all_rows = []
        for payload in DEFAULT_FEW_SHOT_EXAMPLES:
            rows = await service.list_examples(
                str(payload["doc_type"]),
                payload["stakeholder"],
                active_only=False,
            )
            all_rows.extend(rows)

        deduped = {str(row.id): row for row in all_rows}
        print(f"Seeded {len(deduped)} few-shot example rows.")
        for row in sorted(deduped.values(), key=lambda item: (item.doc_type, item.stakeholder.value, item.sort_order)):
            print(f"- {row.doc_type} / {row.stakeholder.value}: {row.title}")


def build_model(*, payload: dict[str, object]) -> FewShotExample:
    return FewShotExample(
        doc_type=str(payload["doc_type"]),
        stakeholder=payload["stakeholder"],
        title=str(payload["title"]),
        input_context=str(payload["input_context"]),
        output_text=str(payload["output_text"]),
        sort_order=int(payload["sort_order"]),
        is_active=True,
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Seed few-shot drafting examples into PostgreSQL.",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Replace existing seeded few-shot examples with the default seed content.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    asyncio.run(seed_few_shot_examples(overwrite=args.overwrite))


if __name__ == "__main__":
    main()

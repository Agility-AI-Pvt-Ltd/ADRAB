"""
Seed document guidance records into PostgreSQL.

Usage:
  .venv/bin/python scripts/seed_document_guidance.py
  .venv/bin/python scripts/seed_document_guidance.py --overwrite
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
from services.document_guidance_service import (
    DEFAULT_DOCUMENT_GUIDANCE,
    DocumentGuidanceService,
)


async def seed_document_guidance(*, overwrite: bool) -> None:
    await init_db()

    async with get_db_context() as session:
        service = DocumentGuidanceService(session)

        if overwrite:
            for doc_type, payload in DEFAULT_DOCUMENT_GUIDANCE.items():
                guidance = await service.get_guidance(doc_type)
                guidance.title = payload["title"]
                guidance.description = payload["description"]
                guidance.key_requirements = payload["key_requirements"]
                session.add(guidance)
            await session.flush()
        else:
            await service.ensure_seeded()

        rows = await service.list_guidance()
        print(f"Seeded {len(rows)} document guidance rows.")
        for row in rows:
            print(f"- {row.doc_type}: {row.title}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Seed founder-editable document guidance into PostgreSQL.",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Replace existing document guidance rows with the default seed content.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    asyncio.run(seed_document_guidance(overwrite=args.overwrite))


if __name__ == "__main__":
    main()

"""
Import a markdown/text file into PostgreSQL as an LLM knowledge snippet.

Usage:
  .venv/bin/python scripts/import_knowledge_snippet.py \
    --slug shreya-career-counsellor \
    --title "Shreya Career Counsellor Profile" \
    --file /path/to/output.md
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
from services.knowledge_snippet_service import KnowledgeSnippetService


async def import_snippet(*, slug: str, title: str, file_path: str, sort_order: int) -> None:
    await init_db()
    content = Path(file_path).read_text(encoding="utf-8").strip()

    async with get_db_context() as session:
        service = KnowledgeSnippetService(session)
        row = await service.upsert_snippet(
            slug=slug,
            title=title,
            content=content,
            sort_order=sort_order,
            is_active=True,
        )
        print(f"Stored knowledge snippet: {row.slug} ({row.title})")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import a file into PostgreSQL as an LLM knowledge snippet.")
    parser.add_argument("--slug", required=True, help="Stable unique key for this snippet.")
    parser.add_argument("--title", required=True, help="Human-readable title.")
    parser.add_argument("--file", required=True, help="Path to the markdown/text file to import.")
    parser.add_argument("--sort-order", type=int, default=0, help="Display/prompt ordering priority.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    asyncio.run(
        import_snippet(
            slug=args.slug,
            title=args.title,
            file_path=args.file,
            sort_order=args.sort_order,
        )
    )


if __name__ == "__main__":
    main()

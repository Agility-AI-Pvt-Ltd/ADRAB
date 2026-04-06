
"""
Knowledge Snippet Service
Stores reusable factual context in PostgreSQL and injects it into AI prompts.
"""

from typing import List

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.models import KnowledgeSnippet


class KnowledgeSnippetService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def upsert_snippet(
        self,
        *,
        slug: str,
        title: str,
        content: str,
        sort_order: int = 0,
        is_active: bool = True,
    ) -> KnowledgeSnippet:
        stmt = select(KnowledgeSnippet).where(KnowledgeSnippet.slug == slug)
        result = await self._session.execute(stmt)
        existing = result.scalar_one_or_none()

        if existing is None:
            snippet = KnowledgeSnippet(
                slug=slug,
                title=title,
                content=content,
                sort_order=sort_order,
                is_active=is_active,
            )
            self._session.add(snippet)
            await self._session.flush()
            await self._session.refresh(snippet)
            return snippet

        existing.title = title
        existing.content = content
        existing.sort_order = sort_order
        existing.is_active = is_active
        self._session.add(existing)
        await self._session.flush()
        await self._session.refresh(existing)
        return existing

    async def list_active(self) -> List[KnowledgeSnippet]:
        stmt = (
            select(KnowledgeSnippet)
            .where(KnowledgeSnippet.is_active.is_(True))
            .order_by(KnowledgeSnippet.sort_order.asc(), KnowledgeSnippet.updated_at.desc())
        )
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def render_prompt_block(self) -> str:
        snippets = await self.list_active()
        if not snippets:
            return ""

        lines = ["ADDITIONAL KNOWLEDGE CONTEXT"]
        for snippet in snippets:
            lines.append(f"- {snippet.title}:")
            lines.append(snippet.content)
            lines.append("")
        return "\n".join(lines).strip()

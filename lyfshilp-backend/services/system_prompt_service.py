"""
System Prompt Service
Founders can update the AI brand-voice system prompt via the Settings panel.
The active prompt is loaded on every AI call so changes take effect immediately.
"""

from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.logging import get_logger
from models.models import SystemPrompt, User
from schemas.admin import SystemPromptUpdate
from services.ai_service import DEFAULT_SYSTEM_PROMPT

logger = get_logger(__name__)


class SystemPromptService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def ensure_seeded(self) -> SystemPrompt:
        """Ensure there is at least one active prompt stored in PostgreSQL."""
        existing = await self.get_active_prompt()
        if existing is not None:
            return existing

        seeded = SystemPrompt(
            prompt_text=DEFAULT_SYSTEM_PROMPT,
            label="default (seed)",
            is_active=True,
        )
        self._session.add(seeded)
        await self._session.flush()
        await self._session.refresh(seeded)
        logger.info("Seeded default system prompt")
        return seeded

    async def get_active_prompt_text(self) -> str:
        """Return the text of the currently active system prompt, falling back to default."""
        prompt = await self.ensure_seeded()
        return prompt.prompt_text

    async def get_active_prompt(self) -> Optional[SystemPrompt]:
        stmt = (
            select(SystemPrompt)
            .where(SystemPrompt.is_active.is_(True))
            .order_by(SystemPrompt.updated_at.desc())
            .limit(1)
        )
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()

    async def update_prompt(self, data: SystemPromptUpdate, actor: User) -> SystemPrompt:
        """Deactivate the current prompt and create a new active one."""
        # Deactivate all current active prompts
        stmt = select(SystemPrompt).where(SystemPrompt.is_active.is_(True))
        result = await self._session.execute(stmt)
        for old in result.scalars().all():
            old.is_active = False
            self._session.add(old)

        new_prompt = SystemPrompt(
            prompt_text=data.prompt_text,
            label=data.label or "default",
            is_active=True,
            updated_by=actor.id,
        )
        self._session.add(new_prompt)
        await self._session.flush()
        await self._session.refresh(new_prompt)

        logger.info("System prompt updated", extra={"by": str(actor.id), "label": new_prompt.label})
        return new_prompt

    async def list_prompts(self) -> List[SystemPrompt]:
        stmt = select(SystemPrompt).order_by(SystemPrompt.updated_at.desc())
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

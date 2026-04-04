"""Persist workflow state snapshots on submissions."""

from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from models.models import WorkflowStage


class SubmissionWorkflowMemoryService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def ensure_schema(self) -> None:
        await self._session.execute(
            text(
                """
                ALTER TABLE submissions
                ADD COLUMN IF NOT EXISTS workflow_stage VARCHAR(50)
                """
            )
        )
        await self._session.execute(
            text(
                """
                ALTER TABLE submissions
                ADD COLUMN IF NOT EXISTS workflow_memory JSON
                """
            )
        )
        await self._session.execute(
            text(
                """
                UPDATE submissions
                SET workflow_stage = 'DRAFT_CREATED'
                WHERE workflow_stage IS NULL
                """
            )
        )

    @staticmethod
    def initial_memory(*, doc_type: str, stakeholder: str, context_form_data: dict[str, Any] | None) -> dict[str, Any]:
        return {
            "doc_type": doc_type,
            "stakeholder": stakeholder,
            "context_form_data": context_form_data or {},
            "events": [
                {
                    "stage": WorkflowStage.DRAFT_CREATED.value,
                    "label": "Draft created",
                }
            ],
        }

    @staticmethod
    def append_event(
        current_memory: dict[str, Any] | None,
        *,
        stage: WorkflowStage,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        memory = dict(current_memory or {})
        events = list(memory.get("events") or [])
        events.append({"stage": stage.value, **payload})
        memory["events"] = events
        return memory

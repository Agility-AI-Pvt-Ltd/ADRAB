"""Admin & Settings endpoints — system prompt, audit log"""

from typing import List

from fastapi import APIRouter
from sqlalchemy import desc, select

from api.dependencies import CurrentUser, DBSession, FounderOnly
from models.models import AuditLog
from schemas.admin import (
    AuditLogResponse,
    DocumentGuidanceCreate,
    DocumentGuidanceResponse,
    DocumentGuidanceUpdate,
    SystemPromptResponse,
    SystemPromptUpdate,
)
from services.document_guidance_service import DocumentGuidanceService
from services.system_prompt_service import SystemPromptService

router = APIRouter(prefix="/admin", tags=["Admin"])


# ── System Prompt (Brand Voice) ───────────────────────────────────────────────

@router.get("/system-prompt", response_model=SystemPromptResponse, dependencies=[FounderOnly])
async def get_active_prompt(session: DBSession):
    """Return the currently active AI system prompt."""
    service = SystemPromptService(session)
    prompt = await service.get_active_prompt()
    if prompt is None:
        from services.ai_service import DEFAULT_SYSTEM_PROMPT
        return {"id": None, "prompt_text": DEFAULT_SYSTEM_PROMPT, "label": "default (seed)", "is_active": True, "updated_at": None}
    return prompt


@router.put("/system-prompt", response_model=SystemPromptResponse, dependencies=[FounderOnly])
async def update_system_prompt(
    body: SystemPromptUpdate,
    current_user: CurrentUser,
    session: DBSession,
):
    """
    Founders: update the AI brand-voice system prompt.
    Takes effect on the next AI call — no restart needed.
    """
    service = SystemPromptService(session)
    return await service.update_prompt(body, current_user)


@router.get("/system-prompt/history", response_model=List[SystemPromptResponse], dependencies=[FounderOnly])
async def prompt_history(session: DBSession):
    """List all historical system prompt versions."""
    service = SystemPromptService(session)
    return await service.list_prompts()


@router.get("/document-guidance", response_model=List[DocumentGuidanceResponse], dependencies=[FounderOnly])
async def list_document_guidance(session: DBSession):
    """Return editable guidance for each document type."""
    service = DocumentGuidanceService(session)
    await service.ensure_seeded()
    return await service.list_guidance()


@router.post("/document-guidance", response_model=DocumentGuidanceResponse, dependencies=[FounderOnly], status_code=201)
async def create_document_guidance(
    body: DocumentGuidanceCreate,
    current_user: CurrentUser,
    session: DBSession,
):
    """Create a brand new founder-managed document type and its AI guidance."""
    service = DocumentGuidanceService(session)
    return await service.create_guidance(body, current_user)


@router.put("/document-guidance/{doc_type}", response_model=DocumentGuidanceResponse, dependencies=[FounderOnly])
async def update_document_guidance(
    doc_type: str,
    body: DocumentGuidanceUpdate,
    current_user: CurrentUser,
    session: DBSession,
):
    """Update founder-managed writing guidance for a specific document type."""
    service = DocumentGuidanceService(session)
    return await service.update_guidance(doc_type, body, current_user)


# ── Audit Log ─────────────────────────────────────────────────────────────────

@router.get("/audit-log", response_model=List[AuditLogResponse], dependencies=[FounderOnly])
async def audit_log(session: DBSession, limit: int = 100, offset: int = 0):
    """
    Founders: paginated audit log of all system actions.
    Shows who created/approved/rejected what and when.
    """
    stmt = (
        select(AuditLog)
        .order_by(desc(AuditLog.created_at))
        .limit(limit)
        .offset(offset)
    )
    result = await session.execute(stmt)
    return result.scalars().all()

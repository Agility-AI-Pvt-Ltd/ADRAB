"""Founder Knowledge Library endpoints."""

from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, File, Form, UploadFile

from api.dependencies import CurrentUser, DBSession, FounderOnly
from schemas.library import (
    KnowledgeLibraryAnalysis,
    KnowledgeLibraryDriveImportRequest,
    KnowledgeLibraryAnalyzeRequest,
    KnowledgeLibraryResponse,
    KnowledgeLibraryUpdate,
)
from services.knowledge_library_service import KnowledgeLibraryService

router = APIRouter(prefix="/library", tags=["Library"])


def _csv_to_list(value: Optional[str]) -> Optional[list[str]]:
    if not value:
        return None
    items = [part.strip() for part in value.split(",")]
    cleaned = [item for item in items if item]
    return cleaned or None


@router.get("/items", response_model=List[KnowledgeLibraryResponse], dependencies=[FounderOnly])
async def list_items(session: DBSession):
    service = KnowledgeLibraryService(session)
    return await service.list_items()


@router.post("/items/parse", response_model=KnowledgeLibraryResponse, status_code=201, dependencies=[FounderOnly])
async def parse_item(
    current_user: CurrentUser,
    session: DBSession,
    title: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    archive_source: bool = Form(True),
    file: UploadFile = File(...),
):
    service = KnowledgeLibraryService(session)
    return await service.parse_item(
        current_user=current_user,
        file=file,
        title=title,
        description=description,
        archive_source=archive_source,
    )


@router.post("/items/import-drive", response_model=KnowledgeLibraryResponse, status_code=201, dependencies=[FounderOnly])
async def import_drive_item(
    body: KnowledgeLibraryDriveImportRequest,
    current_user: CurrentUser,
    session: DBSession,
):
    service = KnowledgeLibraryService(session)
    return await service.import_drive_item(
        current_user=current_user,
        drive_file_id=body.drive_file_id,
        title=body.title,
        description=body.description,
        is_active=body.is_active,
    )


@router.post("/items", response_model=KnowledgeLibraryResponse, status_code=201, dependencies=[FounderOnly])
async def create_item(
    current_user: CurrentUser,
    session: DBSession,
    title: str = Form(...),
    section_key: str = Form(...),
    section_label: str = Form(...),
    description: Optional[str] = Form(None),
    source_file_url: Optional[str] = Form(None),
    content_markdown: str = Form(""),
    applies_to_doc_types: Optional[str] = Form(None),
    applies_to_stakeholders: Optional[str] = Form(None),
    visible_to_departments: Optional[str] = Form(None),
    tags: Optional[str] = Form(None),
    sort_order: int = Form(0),
    is_active: bool = Form(True),
    archive_source: bool = Form(True),
    file: UploadFile | None = File(None),
):
    service = KnowledgeLibraryService(session)
    return await service.create_item(
        title=title,
        section_key=section_key,
        section_label=section_label,
        description=description,
        source_file_url=source_file_url,
        content_markdown=content_markdown,
        current_user=current_user,
        file=file,
        applies_to_doc_types=_csv_to_list(applies_to_doc_types),
        applies_to_stakeholders=_csv_to_list(applies_to_stakeholders),
        visible_to_departments=_csv_to_list(visible_to_departments),
        tags=_csv_to_list(tags),
        sort_order=sort_order,
        is_active=is_active,
        archive_source=archive_source,
    )


@router.get("/items/{item_id}", response_model=KnowledgeLibraryResponse, dependencies=[FounderOnly])
async def get_item(item_id: UUID, session: DBSession):
    service = KnowledgeLibraryService(session)
    return await service.get_item(item_id)


@router.post("/items/{item_id}/analyze", response_model=KnowledgeLibraryResponse, dependencies=[FounderOnly])
async def analyze_item(
    item_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
    body: KnowledgeLibraryAnalyzeRequest | None = None,
):
    service = KnowledgeLibraryService(session)
    if body is None:
        return await service.analyze_item(item_id, current_user)
    return await service.analyze_item_with_guidance(
        item_id,
        current_user,
        founder_instructions=body.founder_instructions,
        auto_only=body.auto_only,
    )


@router.put("/items/{item_id}", response_model=KnowledgeLibraryResponse, dependencies=[FounderOnly])
async def update_item(
    item_id: UUID,
    body: KnowledgeLibraryUpdate,
    current_user: CurrentUser,
    session: DBSession,
):
    service = KnowledgeLibraryService(session)
    return await service.update_item(
        item_id,
        title=body.title,
        section_key=body.section_key,
        section_label=body.section_label,
        description=body.description,
        source_file_url=body.source_file_url,
        content_markdown=body.content_markdown,
        current_user=current_user,
        applies_to_doc_types=body.applies_to_doc_types,
        applies_to_stakeholders=body.applies_to_stakeholders,
        visible_to_departments=body.visible_to_departments,
        tags=body.tags,
        sort_order=body.sort_order,
        is_active=body.is_active,
    )


@router.patch("/items/{item_id}/toggle", response_model=KnowledgeLibraryResponse, dependencies=[FounderOnly])
async def toggle_item(
    item_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
):
    service = KnowledgeLibraryService(session)
    return await service.toggle_item(item_id, current_user)


@router.delete("/items/{item_id}", status_code=204, dependencies=[FounderOnly])
async def delete_item(
    item_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
):
    service = KnowledgeLibraryService(session)
    await service.delete_item(item_id, current_user)

"""Schemas — Founder Knowledge Library"""

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class KnowledgeLibraryUpdate(BaseModel):
    title: str
    section_key: str
    section_label: str
    description: Optional[str] = None
    source_file_url: Optional[str] = None
    content_markdown: str
    applies_to_doc_types: Optional[list[str]] = None
    applies_to_stakeholders: Optional[list[str]] = None
    visible_to_departments: Optional[list[str]] = None
    tags: Optional[list[str]] = None
    sort_order: int = 0
    is_active: bool = True


class KnowledgeLibraryAnalysis(BaseModel):
    content_kind: str
    summary: str
    confidence: float
    inferred_title: Optional[str] = None
    inferred_section_key: Optional[str] = None
    inferred_section_label: Optional[str] = None
    recommended_doc_types: list[str] = Field(default_factory=list)
    recommended_stakeholders: list[str] = Field(default_factory=list)
    recommended_tags: list[str] = Field(default_factory=list)
    clarifying_questions: list[str] = Field(default_factory=list)
    needs_clarification: bool = False
    notes: Optional[str] = None


class KnowledgeLibraryIntakeResponse(BaseModel):
    source_filename: Optional[str] = None
    source_mime_type: Optional[str] = None
    source_size_bytes: Optional[int] = None
    content_markdown: str
    raw_text: Optional[str]
    parser_provider: str
    parser_status: str
    parser_notes: Optional[str]
    analysis: KnowledgeLibraryAnalysis


class KnowledgeLibraryDriveImportRequest(BaseModel):
    drive_file_id: str
    title: Optional[str] = None
    description: Optional[str] = None
    is_active: bool = False


class KnowledgeLibraryAnalyzeRequest(BaseModel):
    founder_instructions: Optional[str] = None
    auto_only: bool = False


class KnowledgeLibraryConversationMessage(BaseModel):
    role: str
    content: str
    created_at: Optional[datetime] = None


class KnowledgeLibraryResponse(BaseModel):
    id: uuid.UUID
    title: str
    section_key: str
    section_label: str
    description: Optional[str]
    source_kind: str
    source_file_url: Optional[str]
    source_filename: Optional[str]
    source_mime_type: Optional[str]
    source_size_bytes: Optional[int]
    content_markdown: str
    raw_text: Optional[str]
    applies_to_doc_types: Optional[list[str]]
    applies_to_stakeholders: Optional[list[str]]
    visible_to_departments: Optional[list[str]]
    tags: Optional[list[str]]
    sort_order: int
    is_active: bool
    parser_provider: Optional[str]
    parser_status: Optional[str]
    parser_notes: Optional[str]
    intake_analysis: Optional[dict]
    intake_conversation: Optional[list[KnowledgeLibraryConversationMessage]]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

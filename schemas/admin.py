"""Schemas — Admin & System Prompt"""

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class SystemPromptUpdate(BaseModel):
    prompt_text: str
    label: Optional[str] = "default"


class SystemPromptResponse(BaseModel):
    id: uuid.UUID
    prompt_text: str
    label: str
    is_active: bool
    updated_at: datetime

    model_config = {"from_attributes": True}


class AuditLogResponse(BaseModel):
    id: uuid.UUID
    actor_id: Optional[uuid.UUID]
    action: str
    resource_type: str
    resource_id: Optional[str]
    metadata: Optional[dict]
    created_at: datetime

    model_config = {"from_attributes": True}


class DocumentGuidanceUpdate(BaseModel):
    doc_type: str | None = None
    title: str
    description: str
    key_requirements: str


class DocumentGuidanceCreate(BaseModel):
    doc_type: str
    title: str
    description: str
    key_requirements: str


class DocumentGuidanceResponse(BaseModel):
    id: uuid.UUID
    doc_type: str
    title: str
    description: str
    key_requirements: str
    updated_at: datetime

    model_config = {"from_attributes": True}


class StakeholderGuidanceUpdate(BaseModel):
    title: str
    guidance_text: str


class StakeholderGuidanceResponse(BaseModel):
    id: uuid.UUID
    stakeholder: str
    title: str
    guidance_text: str
    updated_at: datetime

    model_config = {"from_attributes": True}


class AIReviewGuidanceUpdate(BaseModel):
    review_dimension: str
    title: str
    content: str


class AIReviewGuidanceResponse(BaseModel):
    id: uuid.UUID
    config_key: str
    review_dimension: str
    title: str
    content: str
    updated_at: datetime

    model_config = {"from_attributes": True}


class EmojiGuidanceUpdate(BaseModel):
    title: str
    content: str


class EmojiGuidanceResponse(BaseModel):
    id: uuid.UUID
    config_key: str
    title: str
    content: str
    updated_at: datetime

    model_config = {"from_attributes": True}

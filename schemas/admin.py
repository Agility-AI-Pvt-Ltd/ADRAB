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

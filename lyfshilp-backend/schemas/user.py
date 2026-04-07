"""Schemas — Users"""

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field

from models.models import AuthProvider, TeamDepartment, UserRole


class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: UserRole = UserRole.TEAM_MEMBER
    department: Optional[TeamDepartment] = None


class UserUpdate(BaseModel):
    name: Optional[str] = None
    department: Optional[TeamDepartment] = None
    is_active: Optional[bool] = None
    role: Optional[UserRole] = None


class SelfUserUpdate(BaseModel):
    name: Optional[str] = None
    department: Optional[TeamDepartment] = None


class ChangePasswordRequest(BaseModel):
    current_password: Optional[str] = None
    new_password: str = Field(min_length=8)


class DeleteAccountRequest(BaseModel):
    confirm_email: EmailStr
    current_password: Optional[str] = None


class UserResponse(BaseModel):
    id: uuid.UUID
    name: str
    email: EmailStr
    role: UserRole
    department: Optional[TeamDepartment]
    auth_provider: AuthProvider
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class GoogleDriveAuthUrlResponse(BaseModel):
    url: str
    state: str


class GoogleDriveConnectionResponse(BaseModel):
    connected: bool
    google_email: Optional[str] = None
    folder_id: Optional[str] = None
    scopes: Optional[str] = None
    connected_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class GoogleDriveCallbackRequest(BaseModel):
    code: str
    state: Optional[str] = None


class GoogleDriveFileResponse(BaseModel):
    id: str
    name: str
    mime_type: str
    web_view_link: Optional[str] = None
    modified_time: Optional[str] = None
    size_bytes: Optional[int] = None

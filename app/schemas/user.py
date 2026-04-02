"""Schemas — Users"""

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr

from app.models.models import AuthProvider, TeamDepartment, UserRole


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

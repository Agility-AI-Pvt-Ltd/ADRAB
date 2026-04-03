"""
ORM Models
One file per logical group — all imported here for Alembic auto-discovery.
"""

import enum
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSON, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db.session import Base


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _uuid() -> uuid.UUID:
    return uuid.uuid4()


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class UserRole(str, enum.Enum):
    FOUNDER = "founder"       # approver / CEO
    TEAM_MEMBER = "team_member"
    ADMIN = "admin"


class TeamDepartment(str, enum.Enum):
    SALES = "sales"
    MARKETING = "marketing"
    COUNSELLOR = "counsellor"
    ACADEMIC = "academic"
    FOUNDERS = "founders"


class Stakeholder(str, enum.Enum):
    PARENT = "parent"
    STUDENT = "student"
    PRINCIPAL = "principal"
    COUNSELLOR = "counsellor"
    CORPORATE = "corporate"
    INVESTOR = "investor"
    GOVERNMENT = "government"


class SubmissionStatus(str, enum.Enum):
    DRAFT = "draft"
    PENDING = "pending"
    UNDER_REVIEW = "under_review"
    APPROVED = "approved"
    REJECTED = "rejected"


class AuthProvider(str, enum.Enum):
    LOCAL = "local"
    GOOGLE = "google"


# ---------------------------------------------------------------------------
# User
# ---------------------------------------------------------------------------

class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    hashed_password: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), nullable=False, default=UserRole.TEAM_MEMBER)
    department: Mapped[Optional[TeamDepartment]] = mapped_column(Enum(TeamDepartment), nullable=True)
    auth_provider: Mapped[AuthProvider] = mapped_column(Enum(AuthProvider), nullable=False, default=AuthProvider.LOCAL)
    google_sub: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, unique=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=False)

    # Relationships
    submissions: Mapped[List["Submission"]] = relationship("Submission", back_populates="author", foreign_keys="Submission.user_id")
    audit_logs: Mapped[List["AuditLog"]] = relationship("AuditLog", back_populates="actor")

    def __repr__(self) -> str:
        return f"<User {self.email} ({self.role})>"


# ---------------------------------------------------------------------------
# Submission
# ---------------------------------------------------------------------------

class Submission(Base):
    __tablename__ = "submissions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    # Content metadata
    doc_type: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    stakeholder: Mapped[Stakeholder] = mapped_column(Enum(Stakeholder), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    context_form_data: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)   # key/value from creation form
    file_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    file_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # AI Review
    ai_score: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    ai_scorecard: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)        # {tone:x, format:x, ...}
    ai_suggestions: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)      # [{text, original, replacement}]
    ai_rewrite: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Status & versioning
    status: Mapped[SubmissionStatus] = mapped_column(Enum(SubmissionStatus), nullable=False, default=SubmissionStatus.DRAFT)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    parent_submission_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("submissions.id"), nullable=True)

    # Timestamps
    submitted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=False)

    # Relationships
    author: Mapped["User"] = relationship("User", back_populates="submissions", foreign_keys=[user_id])
    feedback: Mapped[Optional["Feedback"]] = relationship("Feedback", back_populates="submission", uselist=False)
    visibility: Mapped[Optional["Visibility"]] = relationship("Visibility", back_populates="submission", uselist=False)
    child_versions: Mapped[List["Submission"]] = relationship("Submission", foreign_keys=[parent_submission_id])

    def __repr__(self) -> str:
        return f"<Submission {self.id} [{self.doc_type} / {self.status}]>"


# ---------------------------------------------------------------------------
# Feedback
# ---------------------------------------------------------------------------

class Feedback(Base):
    __tablename__ = "feedback"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    submission_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("submissions.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    founder_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ai_generated_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=False)

    submission: Mapped["Submission"] = relationship("Submission", back_populates="feedback")


# ---------------------------------------------------------------------------
# Visibility (who can see an approved doc)
# ---------------------------------------------------------------------------

class Visibility(Base):
    __tablename__ = "visibility"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    submission_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("submissions.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    visible_to_roles: Mapped[Optional[List[str]]] = mapped_column(ARRAY(String), nullable=True)
    visible_to_user_ids: Mapped[Optional[List[str]]] = mapped_column(ARRAY(String), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)

    submission: Mapped["Submission"] = relationship("Submission", back_populates="visibility")


# ---------------------------------------------------------------------------
# System Prompt (editable brand-voice config)
# ---------------------------------------------------------------------------

class SystemPrompt(Base):
    __tablename__ = "system_prompts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    prompt_text: Mapped[str] = mapped_column(Text, nullable=False)
    label: Mapped[str] = mapped_column(String(100), nullable=False, default="default")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=False)


# ---------------------------------------------------------------------------
# Document Guidance (editable per-document-type writing rules)
# ---------------------------------------------------------------------------

class DocumentGuidance(Base):
    __tablename__ = "document_guidance"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    doc_type: Mapped[str] = mapped_column(String(100), nullable=False, unique=True, index=True)
    title: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    key_requirements: Mapped[str] = mapped_column(Text, nullable=False)
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=False)


# ---------------------------------------------------------------------------
# Audit Log
# ---------------------------------------------------------------------------

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    actor_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    action: Mapped[str] = mapped_column(String(100), nullable=False)      # e.g. "submission.approve"
    resource_type: Mapped[str] = mapped_column(String(100), nullable=False)
    resource_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    metadata_json: Mapped[Optional[dict]] = mapped_column("metadata", JSON, nullable=True)
    ip_address: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)

    actor: Mapped[Optional["User"]] = relationship("User", back_populates="audit_logs")

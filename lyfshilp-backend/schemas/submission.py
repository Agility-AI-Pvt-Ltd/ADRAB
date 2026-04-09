"""Schemas — Submissions"""

import uuid
from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field

from schemas.admin import DocumentGuidanceResponse
from models.models import Stakeholder, SubmissionStatus, WorkflowStage


# ---------------------------------------------------------------------------
# AI Scorecard (mirroring the spec's JSON structure)
# ---------------------------------------------------------------------------

class ScoreBreakdown(BaseModel):
    tone_voice: int = Field(ge=0, le=20)
    format_structure: int = Field(ge=0, le=20)
    stakeholder_fit: int = Field(ge=0, le=20)
    missing_elements: int = Field(ge=0, le=20)
    improvement_scope: int = Field(ge=0, le=20)


class AISuggestion(BaseModel):
    original: str
    replacement: str
    reason: str


class GrammarCheckResponse(BaseModel):
    score: int = Field(ge=0, le=20)
    notes: List[str] = []


class AIScorecardResponse(BaseModel):
    score: int = Field(ge=0, le=100)
    dimensions: ScoreBreakdown
    grammar_check: GrammarCheckResponse | None = None
    suggestions: List[AISuggestion]
    rewrite: str


# ---------------------------------------------------------------------------
# Submission CRUD schemas
# ---------------------------------------------------------------------------

class ContextFormData(BaseModel):
    """Flexible key-value context data for AI draft generation."""
    fields: Dict[str, Any] = {}


class SubmissionCreate(BaseModel):
    doc_type: str
    stakeholder: Stakeholder
    content: str = Field(min_length=10)
    context_form_data: Optional[ContextFormData] = None
    ai_precheck: Optional[AIScorecardResponse] = None
    precheck_workflow_memory: Optional[Dict[str, Any]] = None


class GenerateDraftRequest(BaseModel):
    """Used when the team member wants the AI to generate a fresh draft."""
    doc_type: str
    stakeholder: Stakeholder
    context_form_data: ContextFormData
    llm_mode: Literal["autonomous", "guided"] = "guided"
    thinking_instructions: Optional[str] = None
    selected_library_item_ids: Optional[List[uuid.UUID]] = None


class DraftWorkflowResponse(BaseModel):
    draft: str
    workflow_stage: WorkflowStage
    workflow_memory: Dict[str, Any]


class RefineDraftRequest(BaseModel):
    content: str
    action: str = Field(description="shorter | more_formal | warmer | add_urgency | regenerate")
    doc_type: str
    stakeholder: Stakeholder
    human_input: Optional[str] = None
    thinking_instructions: Optional[str] = None
    suggestions: Optional[List[AISuggestion]] = None
    current_department: Optional[str] = None


class DraftAnalysisRequest(BaseModel):
    doc_type: str
    stakeholder: Stakeholder
    content: str = Field(min_length=10)
    context_form_data: Optional[ContextFormData] = None


class DraftAnalysisResponse(BaseModel):
    score: int = Field(ge=0, le=100)
    dimensions: ScoreBreakdown
    grammar_check: GrammarCheckResponse | None = None
    suggestions: List[AISuggestion]
    rewrite: str
    workflow_stage: WorkflowStage
    workflow_memory: Dict[str, Any]


class LibraryContextPreviewResponse(BaseModel):
    library_context: str
    has_context: bool


class ComposeStakeholderOption(BaseModel):
    value: str
    label: str


class ComposeOptionsResponse(BaseModel):
    document_guidance: list["DocumentGuidanceResponse"]
    stakeholders: list[ComposeStakeholderOption]


class VisibilityResponse(BaseModel):
    visible_to_roles: Optional[List[str]] = None
    visible_to_departments: Optional[List[str]] = None
    visible_to_user_ids: Optional[List[str]] = None

    model_config = {"from_attributes": True}


class SubmissionAuthorResponse(BaseModel):
    id: uuid.UUID
    name: str
    email: str

    model_config = {"from_attributes": True}


class FeedbackResponse(BaseModel):
    founder_note: Optional[str] = None
    ai_generated_note: Optional[str] = None

    model_config = {"from_attributes": True}


class SubmissionResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    doc_type: str
    stakeholder: Stakeholder
    content: str
    ai_score: Optional[int]
    ai_scorecard: Optional[Dict]
    ai_suggestions: Optional[List]
    ai_rewrite: Optional[str]
    status: SubmissionStatus
    workflow_stage: WorkflowStage
    workflow_memory: Optional[Dict]
    version: int
    parent_submission_id: Optional[uuid.UUID]
    file_url: Optional[str]
    file_name: Optional[str]
    submitted_at: Optional[datetime]
    reviewed_at: Optional[datetime]
    created_at: datetime
    author: Optional[SubmissionAuthorResponse] = None
    feedback: Optional[FeedbackResponse] = None
    visibility: Optional[VisibilityResponse] = None

    model_config = {"from_attributes": True}


class SubmissionListItem(BaseModel):
    id: uuid.UUID
    doc_type: str
    stakeholder: Stakeholder
    ai_score: Optional[int]
    status: SubmissionStatus
    version: int
    author_name: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ReviewAction(BaseModel):
    action: str = Field(description="approve | approve_with_edits | reject")
    edited_content: Optional[str] = None
    founder_note: Optional[str] = None
    visible_to_roles: Optional[List[str]] = None
    visible_to_departments: Optional[List[str]] = None
    visible_to_user_ids: Optional[List[uuid.UUID]] = None


class VisibilityUpdateRequest(BaseModel):
    visible_to_roles: Optional[List[str]] = None
    visible_to_departments: Optional[List[str]] = None
    visible_to_user_ids: Optional[List[uuid.UUID]] = None


class SubmitForReviewRequest(BaseModel):
    assigned_founder_ids: List[uuid.UUID] = Field(default_factory=list, min_length=1)

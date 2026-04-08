"""Typed workflow inputs, outputs, and LangGraph state."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, TypedDict

from models.models import Stakeholder, WorkflowStage
from schemas.submission import AIScorecardResponse, RefineDraftRequest
from services.ai_service import AIService


@dataclass(slots=True)
class DraftGenerationInput:
    doc_type: str
    stakeholder: Stakeholder
    context_form_data: dict[str, Any]
    llm_mode: str = "guided"
    thinking_instructions: str | None = None
    current_department: str | None = None
    available_doc_types: list[str] | None = None
    available_stakeholders: list[str] | None = None


@dataclass(slots=True)
class DraftGenerationResult:
    draft: str
    prompt_context: str
    workflow_stage: WorkflowStage
    workflow_memory: dict[str, Any]


@dataclass(slots=True)
class DraftReviewInput:
    doc_type: str
    stakeholder: Stakeholder
    content: str
    current_department: str | None = None


@dataclass(slots=True)
class DraftReviewResult:
    scorecard: AIScorecardResponse
    prompt_context: str
    workflow_stage: WorkflowStage
    workflow_memory: dict[str, Any]


@dataclass(slots=True)
class DraftRefinementResult:
    draft: str
    prompt_context: str
    workflow_stage: WorkflowStage
    workflow_memory: dict[str, Any]


class DraftGenerationState(TypedDict, total=False):
    doc_type: str
    stakeholder: Stakeholder
    context_form_data: dict[str, Any]
    llm_mode: str
    thinking_instructions: str | None
    current_department: str | None
    available_doc_types: list[str] | None
    available_stakeholders: list[str] | None
    ai_service: AIService
    deterministic_context: str
    enrichment_context: str
    prompt_context: str
    draft: str
    workflow_trace: dict[str, Any]
    workflow_stage: WorkflowStage
    workflow_memory: dict[str, Any]


class DraftReviewState(TypedDict, total=False):
    doc_type: str
    stakeholder: Stakeholder
    content: str
    current_department: str | None
    ai_service: AIService
    deterministic_context: str
    review_context: str
    prompt_context: str
    scorecard: AIScorecardResponse
    workflow_trace: dict[str, Any]
    workflow_stage: WorkflowStage
    workflow_memory: dict[str, Any]


class DraftRefinementState(TypedDict, total=False):
    request: RefineDraftRequest
    current_department: str | None
    ai_service: AIService
    deterministic_context: str
    enrichment_context: str
    prompt_context: str
    thinking_instructions: str | None
    regenerated_prompt: str
    refined_draft: str
    workflow_trace: dict[str, Any]
    workflow_stage: WorkflowStage
    workflow_memory: dict[str, Any]


class RejectionNoteState(TypedDict, total=False):
    doc_type: str
    scorecard: dict[str, Any]
    member_name: str
    founder_name: str
    ai_service: AIService
    rejection_note: str
    workflow_trace: dict[str, Any]

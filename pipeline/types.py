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
    ai_service: AIService
    deterministic_context: str
    enrichment_context: str
    prompt_context: str
    draft: str
    workflow_stage: WorkflowStage
    workflow_memory: dict[str, Any]


class DraftReviewState(TypedDict, total=False):
    doc_type: str
    stakeholder: Stakeholder
    content: str
    ai_service: AIService
    deterministic_context: str
    review_context: str
    prompt_context: str
    scorecard: AIScorecardResponse
    workflow_stage: WorkflowStage
    workflow_memory: dict[str, Any]


class DraftRefinementState(TypedDict, total=False):
    request: RefineDraftRequest
    ai_service: AIService
    deterministic_context: str
    enrichment_context: str
    prompt_context: str
    regenerated_prompt: str
    refined_draft: str
    workflow_stage: WorkflowStage
    workflow_memory: dict[str, Any]


class RejectionNoteState(TypedDict, total=False):
    doc_type: str
    scorecard: dict[str, Any]
    ai_service: AIService
    rejection_note: str

"""Submission endpoints — create, submit, review, version history"""

from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Query, UploadFile, File
from fastapi.responses import FileResponse

from api.dependencies import CurrentUser, DBSession, FounderOnly
from core.exceptions import ForbiddenError
from models.models import Stakeholder
from schemas.submission import (
    DraftAnalysisRequest,
    DraftWorkflowResponse,
    GenerateDraftRequest,
    LibraryContextPreviewResponse,
    RefineDraftRequest,
    ReviewAction,
    SubmissionCreate,
    SubmissionResponse,
    VisibilityUpdateRequest,
)
from services.document_guidance_service import DocumentGuidanceService
from services.file_service import FileService
from services.submission_service import SubmissionService

router = APIRouter(prefix="/submissions", tags=["Submissions"])


# ── AI Draft Generation ───────────────────────────────────────────────────────

@router.post("/generate-draft", response_model=DraftWorkflowResponse)
async def generate_draft(
    body: GenerateDraftRequest,
    current_user: CurrentUser,
    session: DBSession,
):
    """
    Generate a complete document draft in the Founders' voice.
    Returns raw text — not persisted until the team member clicks Submit.
    """
    service = SubmissionService(session)
    return await service.generate_draft(body, current_user)


@router.get("/library-context", response_model=LibraryContextPreviewResponse)
async def library_context_preview(
    doc_type: str = Query(...),
    stakeholder: Stakeholder = Query(...),
    current_user: CurrentUser = None,
    session: DBSession = None,
):
    """Preview founder library context matched for this doc type and stakeholder."""
    service = SubmissionService(session)
    return await service.library_context_preview(doc_type, stakeholder, current_user)


@router.post("/refine-draft", response_model=DraftWorkflowResponse)
async def refine_draft(
    body: RefineDraftRequest,
    current_user: CurrentUser,
    session: DBSession,
):
    """
    Apply a one-click refinement (shorter / warmer / more formal / add urgency / regenerate).
    Returns the revised text — not persisted.
    """
    service = SubmissionService(session)
    return await service.refine_draft(body, current_user)


@router.post("/extract-file")
async def extract_file_for_draft(
    file: UploadFile = File(...),
    current_user: CurrentUser = None,
):
    """
    Extract text from a .pdf or .docx before a submission exists so a team member
    can run an AI readiness pre-check on an existing draft.
    """
    file_service = FileService()
    extracted_text = await file_service.extract_text(file)
    return {
        "file_name": file.filename,
        "extracted_text": extracted_text,
    }


@router.post("/analyze-draft")
async def analyze_draft(
    body: DraftAnalysisRequest,
    current_user: CurrentUser,
    session: DBSession,
):
    """
    Analyze a human-authored draft and return score, suggestions, rewrite,
    and workflow memory before the draft is saved or submitted.
    """
    service = SubmissionService(session)
    return await service.analyze_draft(body, current_user)


# ── Submission Lifecycle ──────────────────────────────────────────────────────

@router.post("/", response_model=SubmissionResponse, status_code=201)
async def create_submission(
    body: SubmissionCreate,
    current_user: CurrentUser,
    session: DBSession,
):
    """Save a new submission as DRAFT (no AI check yet)."""
    service = SubmissionService(session)
    return await service.create_submission(body, current_user)


@router.post("/{submission_id}/submit", response_model=SubmissionResponse)
async def submit_for_review(
    submission_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
):
    """
    Trigger AI pre-check and move submission to PENDING status.
    Returns the updated submission with full AI scorecard attached.
    """
    service = SubmissionService(session)
    return await service.submit_for_review(submission_id, current_user)


@router.post("/{submission_id}/upload-file")
async def upload_file(
    submission_id: UUID,
    file: UploadFile = File(...),
    current_user: CurrentUser = None,
    session: DBSession = None,
):
    """
    Attach a .pdf or .docx file to a submission.
    Text is extracted and returned so the team member can paste it into content.
    """
    file_service = FileService()
    from db.repositories.submission_repository import SubmissionRepository
    repo = SubmissionRepository(session)
    sub = await repo.get_or_raise(submission_id)
    if current_user.role.value != "team_member":
        raise ForbiddenError("Only team members can upload files for submissions.")
    if not current_user.is_active:
        raise ForbiddenError("Your account is awaiting founder approval. You can view the app, but cannot submit documents yet.")
    if sub.user_id != current_user.id:
        raise ForbiddenError("You do not own this submission.")

    extracted_text = await file_service.extract_text(file)

    # Reset stream, then upload
    await file.seek(0)
    file_url, file_name = await file_service.upload(file, current_user.id)

    # Persist URL on submission
    await repo.update(sub, file_url=file_url, file_name=file_name)

    return {"file_url": file_url, "file_name": file_name, "extracted_text": extracted_text}


@router.post("/{submission_id}/resubmit", response_model=SubmissionResponse, status_code=201)
async def resubmit(
    submission_id: UUID,
    body: dict,          # {"content": "..."}
    current_user: CurrentUser,
    session: DBSession,
):
    """
    Create a new version of a rejected submission.
    Linked via parent_submission_id; version number auto-increments.
    """
    service = SubmissionService(session)
    new_sub = await service.resubmit(submission_id, body["content"], current_user)
    return new_sub


# ── Founder Review ────────────────────────────────────────────────────────────

@router.post("/{submission_id}/review", response_model=SubmissionResponse)
async def review_submission(
    submission_id: UUID,
    body: ReviewAction,
    current_user: CurrentUser,
    session: DBSession,
):
    """
    Founder action: approve / approve_with_edits / reject.
    Automatically generates an AI rejection note on reject.
    """
    service = SubmissionService(session)
    return await service.review(submission_id, body, current_user)


@router.patch(
    "/{submission_id}/visibility",
    response_model=SubmissionResponse,
    dependencies=[FounderOnly],
)
async def update_submission_visibility(
    submission_id: UUID,
    body: VisibilityUpdateRequest,
    current_user: CurrentUser,
    session: DBSession,
):
    """
    Founder action: update visibility for an already approved submission.
    """
    service = SubmissionService(session)
    return await service.update_visibility(submission_id, body, current_user)


@router.get("/{submission_id}/download-file", response_class=FileResponse)
async def download_submission_file(
    submission_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
):
    service = SubmissionService(session)
    return await service.download_submission_file(submission_id, current_user)


# ── Queries ───────────────────────────────────────────────────────────────────

@router.get("/document-guidance")
async def available_document_guidance(
    current_user: CurrentUser,
    session: DBSession,
):
    """Return the document types available for authenticated users to compose."""
    service = DocumentGuidanceService(session)
    await service.ensure_seeded()
    return await service.list_guidance()

@router.get("/dashboard")
async def founders_dashboard(
    current_user: CurrentUser,
    session: DBSession,
    doc_type: Optional[str] = Query(None),
    stakeholder: Optional[Stakeholder] = Query(None),
    user_id: Optional[UUID] = Query(None),
):
    """
    Founders' dashboard: pending submissions + status counts.
    Supports filtering by doc_type, stakeholder, and team member.
    """
    service = SubmissionService(session)
    return await service.get_founders_dashboard(
        current_user, doc_type=doc_type, stakeholder=stakeholder, user_id=user_id
    )


@router.get("/my", response_model=List[SubmissionResponse])
async def my_submissions(current_user: CurrentUser, session: DBSession):
    """Team member: list all own submissions with current status."""
    service = SubmissionService(session)
    return await service.get_my_submissions(current_user)


@router.get("/{submission_id}", response_model=SubmissionResponse)
async def get_submission(
    submission_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
):
    """Fetch a single submission. Team members only see their own."""
    service = SubmissionService(session)
    return await service.get_submission_detail(submission_id, current_user)


@router.get("/{submission_id}/versions", response_model=List[SubmissionResponse])
async def version_history(
    submission_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
):
    """Founders only: full version chain for a submission."""
    service = SubmissionService(session)
    return await service.get_version_history(submission_id, current_user)

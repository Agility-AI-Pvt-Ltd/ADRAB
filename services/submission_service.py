"""
Submission Service
Orchestrates the full document lifecycle:
  create draft → submit → AI review → founder action → versioning
"""

from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional
from uuid import UUID

from fastapi.responses import FileResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from core.exceptions import ForbiddenError, NotFoundError, ValidationError
from core.logging import get_logger
from db.repositories.submission_repository import SubmissionRepository
from models.models import (
    AuditLog,
    Feedback,
    Submission,
    SubmissionStatus,
    User,
    UserRole,
    Visibility,
    WorkflowStage,
)
from pipeline.context import SubmissionPromptContextService
from pipeline.types import DraftGenerationInput, DraftReviewInput
from pipeline.workflows import SubmissionWorkflowService
from schemas.submission import (
    DraftAnalysisRequest,
    DraftAnalysisResponse,
    DraftWorkflowResponse,
    GenerateDraftRequest,
    RefineDraftRequest,
    ReviewAction,
    SubmissionCreate,
    VisibilityUpdateRequest,
)
from services.file_service import FileService
from services.submission_workflow_memory_service import SubmissionWorkflowMemoryService

logger = get_logger(__name__)


class SubmissionService:
    """All business logic for document submissions."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._submission_repo = SubmissionRepository(session)
        self._prompt_context_service = SubmissionPromptContextService(session)
        self._workflow_service = SubmissionWorkflowService(self._prompt_context_service)
        self._workflow_memory_service = SubmissionWorkflowMemoryService(session)
        self._file_service = FileService()

    # ── Draft generation ──────────────────────────────────────────────────────

    async def generate_draft(self, request: GenerateDraftRequest, actor: User) -> DraftWorkflowResponse:
        """Ask AI to generate a full draft; returns raw document text."""
        await self._workflow_memory_service.ensure_schema()
        self._require_team_member(actor)
        result = await self._workflow_service.generate_draft(
            DraftGenerationInput(
                doc_type=request.doc_type,
                stakeholder=request.stakeholder,
                context_form_data=request.context_form_data.fields,
            )
        )
        return DraftWorkflowResponse(
            draft=result.draft,
            workflow_stage=result.workflow_stage,
            workflow_memory=result.workflow_memory,
        )

    async def analyze_draft(self, request: DraftAnalysisRequest, actor: User) -> DraftAnalysisResponse:
        """Analyze a human-authored draft before it is saved or submitted."""
        await self._workflow_memory_service.ensure_schema()
        self._require_team_member(actor)
        result = await self._workflow_service.review_draft(
            DraftReviewInput(
                doc_type=request.doc_type,
                stakeholder=request.stakeholder,
                content=request.content,
            )
        )
        return DraftAnalysisResponse(
            score=result.scorecard.score,
            dimensions=result.scorecard.dimensions,
            grammar_check=result.scorecard.grammar_check,
            suggestions=result.scorecard.suggestions,
            rewrite=result.scorecard.rewrite,
            workflow_stage=result.workflow_stage,
            workflow_memory=result.workflow_memory,
        )

    async def refine_draft(self, request: RefineDraftRequest, actor: User) -> DraftWorkflowResponse:
        """Apply a refinement action (shorter, warmer, etc.) to draft text."""
        await self._workflow_memory_service.ensure_schema()
        self._require_team_member(actor)
        result = await self._workflow_service.refine_draft(request)
        return DraftWorkflowResponse(
            draft=result.draft,
            workflow_stage=result.workflow_stage,
            workflow_memory=result.workflow_memory,
        )

    # ── Submission lifecycle ──────────────────────────────────────────────────

    async def create_submission(self, data: SubmissionCreate, actor: User) -> Submission:
        """Save a new submission as DRAFT (no AI check yet)."""
        await self._workflow_memory_service.ensure_schema()
        self._require_team_member(actor)
        workflow_memory = (
            data.precheck_workflow_memory
            if data.precheck_workflow_memory is not None
            else self._workflow_memory_service.initial_memory(
                doc_type=data.doc_type,
                stakeholder=data.stakeholder.value,
                context_form_data=data.context_form_data.model_dump() if data.context_form_data else None,
            )
        )
        submission = Submission(
            user_id=actor.id,
            doc_type=data.doc_type,
            stakeholder=data.stakeholder,
            content=data.content,
            context_form_data=data.context_form_data.model_dump() if data.context_form_data else None,
            ai_score=data.ai_precheck.score if data.ai_precheck else None,
            ai_scorecard=data.ai_precheck.model_dump() if data.ai_precheck else None,
            ai_suggestions=[item.model_dump() for item in data.ai_precheck.suggestions] if data.ai_precheck else None,
            ai_rewrite=data.ai_precheck.rewrite if data.ai_precheck else None,
            status=SubmissionStatus.DRAFT,
            workflow_stage=WorkflowStage.DRAFT_CREATED,
            workflow_memory=workflow_memory,
            version=1,
        )
        submission = await self._submission_repo.create(submission)
        await self._log(actor, "submission.create", "submission", str(submission.id))
        refreshed = await self._submission_repo.get_with_relations(submission.id)
        return refreshed or submission

    async def submit_for_review(self, submission_id: UUID, actor: User) -> Submission:
        """Run AI pre-check then mark submission as PENDING."""
        await self._workflow_memory_service.ensure_schema()
        self._require_team_member(actor)
        submission = await self._get_owned_submission(submission_id, actor)
        if submission.status not in (SubmissionStatus.DRAFT, SubmissionStatus.REJECTED):
            raise ValidationError("Only draft or rejected submissions can be (re)submitted.")

        if self._has_persisted_precheck(submission):
            scorecard = submission.ai_scorecard
            workflow_memory = submission.workflow_memory
        else:
            review_result = await self._workflow_service.review_draft(
                DraftReviewInput(
                    content=submission.content,
                    doc_type=submission.doc_type,
                    stakeholder=submission.stakeholder,
                )
            )
            scorecard = review_result.scorecard.model_dump()
            workflow_memory = review_result.workflow_memory

        await self._submission_repo.update(
            submission,
            ai_score=scorecard["score"],
            ai_scorecard=scorecard,
            ai_suggestions=scorecard["suggestions"],
            ai_rewrite=scorecard["rewrite"],
            status=SubmissionStatus.PENDING,
            workflow_stage=WorkflowStage.SUBMITTED_TO_FOUNDER,
            workflow_memory=self._workflow_memory_service.append_event(
                workflow_memory,
                stage=WorkflowStage.SUBMITTED_TO_FOUNDER,
                payload={"label": "Submission sent to founder review"},
            ),
            submitted_at=datetime.now(timezone.utc),
        )

        await self._log(actor, "submission.submit", "submission", str(submission_id))
        refreshed = await self._submission_repo.get_with_relations(submission.id)
        return refreshed or submission

    # ── Founder review actions ────────────────────────────────────────────────

    async def review(
        self,
        submission_id: UUID,
        action_data: ReviewAction,
        founder: User,
    ) -> Submission:
        """Founder approves, approves-with-edits, or rejects a submission."""
        await self._workflow_memory_service.ensure_schema()
        self._require_founder(founder)
        submission = await self._submission_repo.get_with_relations(submission_id)
        if submission is None:
            raise NotFoundError(f"Submission '{submission_id}' not found.")
        if submission.author is None or submission.author.role != UserRole.TEAM_MEMBER:
            raise ForbiddenError("Founders can only review submissions created by team members.")
        if submission.status != SubmissionStatus.PENDING:
            raise ValidationError("Only PENDING submissions can be reviewed.")

        action = action_data.action.lower()

        if action == "approve":
            await self._approve(submission, action_data, founder)
        elif action == "approve_with_edits":
            await self._approve_with_edits(submission, action_data, founder)
        elif action == "reject":
            await self._reject(submission, action_data, founder)
        else:
            raise ValidationError(f"Unknown review action: '{action}'.")

        await self._log(founder, f"submission.{action}", "submission", str(submission_id))
        refreshed = await self._submission_repo.get_with_relations(submission.id)
        return refreshed or submission

    async def _approve(self, submission: Submission, data: ReviewAction, founder: User) -> None:
        await self._submission_repo.update(
            submission,
            status=SubmissionStatus.APPROVED,
            workflow_stage=WorkflowStage.FOUNDER_REVIEWED,
            workflow_memory=self._workflow_memory_service.append_event(
                submission.workflow_memory,
                stage=WorkflowStage.FOUNDER_REVIEWED,
                payload={"label": "Founder approved submission", "action": "approve"},
            ),
            reviewed_at=datetime.now(timezone.utc),
        )
        await self._set_visibility(submission, data)

    async def _approve_with_edits(self, submission: Submission, data: ReviewAction, founder: User) -> None:
        if not data.edited_content:
            raise ValidationError("edited_content is required for approve_with_edits.")
        await self._submission_repo.update(
            submission,
            content=data.edited_content,
            status=SubmissionStatus.APPROVED,
            workflow_stage=WorkflowStage.FOUNDER_REVIEWED,
            workflow_memory=self._workflow_memory_service.append_event(
                submission.workflow_memory,
                stage=WorkflowStage.FOUNDER_REVIEWED,
                payload={"label": "Founder approved with edits", "action": "approve_with_edits"},
            ),
            reviewed_at=datetime.now(timezone.utc),
        )
        await self._set_visibility(submission, data)

    async def _reject(self, submission: Submission, data: ReviewAction, founder: User) -> None:
        # Generate AI rejection note if founder hasn't written one
        ai_note: Optional[str] = None
        if submission.ai_scorecard:
            ai_note = await self._workflow_service.generate_rejection_note(
                submission.ai_scorecard,
                submission.doc_type,
                submission.author.name if submission.author else "Team Member",
                founder.name,
            )

        await self._submission_repo.update(
            submission,
            status=SubmissionStatus.REJECTED,
            workflow_stage=WorkflowStage.FOUNDER_REVIEWED,
            workflow_memory=self._workflow_memory_service.append_event(
                submission.workflow_memory,
                stage=WorkflowStage.FOUNDER_REVIEWED,
                payload={"label": "Founder rejected submission", "action": "reject"},
            ),
            reviewed_at=datetime.now(timezone.utc),
        )

        feedback = Feedback(
            submission_id=submission.id,
            founder_note=data.founder_note,
            ai_generated_note=ai_note,
        )
        self._session.add(feedback)

    async def _set_visibility(self, submission: Submission, data: ReviewAction | VisibilityUpdateRequest) -> None:
        await self._ensure_visibility_schema()
        roles = data.visible_to_roles or []
        departments = data.visible_to_departments or []
        user_ids = [str(uid) for uid in (data.visible_to_user_ids or [])]

        if submission.visibility is not None:
            submission.visibility.visible_to_roles = roles
            submission.visibility.visible_to_departments = departments
            submission.visibility.visible_to_user_ids = user_ids
            self._session.add(submission.visibility)
            return

        vis = Visibility(
            submission_id=submission.id,
            visible_to_roles=roles,
            visible_to_departments=departments,
            visible_to_user_ids=user_ids,
        )
        self._session.add(vis)

    # ── Resubmission (versioning) ─────────────────────────────────────────────

    async def resubmit(
        self,
        original_id: UUID,
        new_content: str,
        actor: User,
    ) -> Submission:
        """Create a new version linked to the original rejected submission."""
        await self._workflow_memory_service.ensure_schema()
        self._require_team_member(actor)
        original = await self._get_owned_submission(original_id, actor)
        if original.status != SubmissionStatus.REJECTED:
            raise ValidationError("Only rejected submissions can be resubmitted.")

        root_id = original.parent_submission_id or original.id
        new_version = Submission(
            user_id=actor.id,
            doc_type=original.doc_type,
            stakeholder=original.stakeholder,
            content=new_content,
            context_form_data=original.context_form_data,
            status=SubmissionStatus.DRAFT,
            workflow_stage=WorkflowStage.DRAFT_CREATED,
            workflow_memory=self._workflow_memory_service.initial_memory(
                doc_type=original.doc_type,
                stakeholder=original.stakeholder.value,
                context_form_data=original.context_form_data,
            ),
            version=original.version + 1,
            parent_submission_id=root_id,
        )
        new_version = await self._submission_repo.create(new_version)
        await self._log(actor, "submission.resubmit", "submission", str(new_version.id))
        return await self.submit_for_review(new_version.id, actor)

    # ── Queries ───────────────────────────────────────────────────────────────

    async def get_founders_dashboard(
        self,
        founder: User,
        doc_type=None,
        stakeholder=None,
        user_id=None,
    ) -> dict:
        await self._workflow_memory_service.ensure_schema()
        self._require_founder(founder)
        pending = await self._submission_repo.get_pending_for_founders(
            doc_type=doc_type, stakeholder=stakeholder, user_id=user_id
        )
        approved = await self._submission_repo.get_approved_for_founders(
            doc_type=doc_type, stakeholder=stakeholder, user_id=user_id
        )
        recent = await self._submission_repo.get_recent_activity_for_founders()
        counts = await self._submission_repo.count_by_status()
        return {"counts": counts, "pending": pending, "approved": approved, "recent": recent}

    async def get_my_submissions(self, actor: User) -> List[Submission]:
        await self._workflow_memory_service.ensure_schema()
        return await self._submission_repo.get_by_user(actor.id)

    async def get_submission_detail(self, submission_id: UUID, actor: User) -> Submission:
        await self._workflow_memory_service.ensure_schema()
        await self._ensure_visibility_schema()
        submission = await self._submission_repo.get_with_relations(submission_id)
        if submission is None:
            raise NotFoundError()
        if actor.role in (UserRole.FOUNDER, UserRole.ADMIN):
            return submission
        if submission.user_id == actor.id:
            return submission
        if not self._can_access_shared_submission(submission, actor):
            raise ForbiddenError()
        return submission

    async def update_visibility(
        self,
        submission_id: UUID,
        data: VisibilityUpdateRequest,
        founder: User,
    ) -> Submission:
        await self._workflow_memory_service.ensure_schema()
        await self._ensure_visibility_schema()
        self._require_founder(founder)
        submission = await self._submission_repo.get_with_relations(submission_id)
        if submission is None:
            raise NotFoundError(f"Submission '{submission_id}' not found.")
        if submission.status != SubmissionStatus.APPROVED:
            raise ValidationError("Visibility can only be updated after approval.")

        await self._set_visibility(submission, data)
        await self._log(founder, "submission.visibility_update", "submission", str(submission_id))
        refreshed = await self._submission_repo.get_with_relations(submission.id)
        return refreshed or submission

    async def get_version_history(self, submission_id: UUID, actor: User) -> List[Submission]:
        await self._workflow_memory_service.ensure_schema()
        self._require_founder(actor)
        return await self._submission_repo.get_version_history(submission_id)

    async def download_submission_file(self, submission_id: UUID, actor: User) -> FileResponse:
        submission = await self.get_submission_detail(submission_id, actor)
        if not submission.file_url:
            raise NotFoundError("No file attached to this submission.")
        file_path = self._file_service.resolve_path(submission.file_url)
        if not file_path.exists() or not file_path.is_file():
            raise NotFoundError("Attached file not found.")
        return FileResponse(
            path=Path(file_path),
            filename=submission.file_name or file_path.name,
        )

    # ── Helpers ───────────────────────────────────────────────────────────────

    async def _get_owned_submission(self, submission_id: UUID, actor: User) -> Submission:
        sub = await self._submission_repo.get_or_raise(submission_id)
        if actor.role != UserRole.FOUNDER and sub.user_id != actor.id:
            raise ForbiddenError("You do not own this submission.")
        return sub

    def _require_team_member(self, actor: User) -> None:
        if actor.role != UserRole.TEAM_MEMBER:
            raise ForbiddenError("Only team members can create and submit documents for approval.")
        if not actor.is_active:
            raise ForbiddenError("Your account is awaiting founder approval. You can view the app, but cannot submit documents yet.")

    async def _log(self, actor: User, action: str, resource_type: str, resource_id: str) -> None:
        log = AuditLog(
            actor_id=actor.id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
        )
        self._session.add(log)

    @staticmethod
    def _require_founder(user: User) -> None:
        if user.role not in (UserRole.FOUNDER, UserRole.ADMIN):
            raise ForbiddenError("Only Founders can perform this action.")

    @staticmethod
    def _can_access_shared_submission(submission: Submission, actor: User) -> bool:
        if submission.status != SubmissionStatus.APPROVED:
            return False
        if submission.visibility is None:
            return False

        if str(actor.id) in set(submission.visibility.visible_to_user_ids or []):
            return True
        if actor.role.value in set(submission.visibility.visible_to_roles or []):
            return True
        if actor.department and actor.department.value in set(submission.visibility.visible_to_departments or []):
            return True
        return False

    async def _ensure_visibility_schema(self) -> None:
        await self._session.execute(
            text(
                """
                ALTER TABLE visibility
                ADD COLUMN IF NOT EXISTS visible_to_departments VARCHAR(255)[]
                """
            )
        )

    @staticmethod
    def _has_persisted_precheck(submission: Submission) -> bool:
        return bool(
            submission.ai_score is not None
            and isinstance(submission.ai_scorecard, dict)
            and submission.ai_suggestions is not None
            and submission.ai_rewrite
        )

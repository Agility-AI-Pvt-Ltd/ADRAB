"""Tests — Submissions (unit-level, AI calls mocked)"""

from unittest.mock import AsyncMock, patch
import pytest
from httpx import AsyncClient

from models.models import AuthProvider, Stakeholder, Submission, SubmissionStatus, User, UserRole
from core.security import hash_password
from schemas.submission import AIScorecardResponse, ScoreBreakdown, AISuggestion, GrammarCheckResponse
from tests.conftest import auth_headers

MOCK_SCORECARD = AIScorecardResponse(
    score=78,
    dimensions=ScoreBreakdown(
        tone_voice=16,
        format_structure=18,
        stakeholder_fit=15,
        missing_elements=14,
        improvement_scope=15,
    ),
    grammar_check=GrammarCheckResponse(
        score=17,
        notes=[
            "Minor tightening needed in sentence openings.",
            "One punctuation pass would improve polish.",
        ],
    ),
    suggestions=[
        AISuggestion(
            original="We are pleased to inform",
            replacement="Here's something your school will love",
            reason="Avoids forbidden phrase; leads with benefit.",
        )
    ],
    rewrite="[AI rewritten document]",
)

SUBMISSION_PAYLOAD = {
    "doc_type": "cold_email",
    "stakeholder": "principal",
    "content": "We are pleased to inform you about our programme at Lyfshilp Academy.",
}


@pytest.mark.asyncio
async def test_create_submission(client: AsyncClient, team_member):
    resp = await client.post(
        "/api/v1/submissions/",
        json=SUBMISSION_PAYLOAD,
        headers=auth_headers(team_member),
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["status"] == "draft"
    assert data["doc_type"] == "cold_email"
    return data["id"]


@pytest.mark.asyncio
async def test_submit_for_review(client: AsyncClient, team_member):
    # First create
    create_resp = await client.post(
        "/api/v1/submissions/",
        json=SUBMISSION_PAYLOAD,
        headers=auth_headers(team_member),
    )
    sub_id = create_resp.json()["id"]

    # Now submit with mocked AI
    with patch(
        "services.ai_service.AIService.review_document",
        new_callable=AsyncMock,
        return_value=MOCK_SCORECARD,
    ):
        resp = await client.post(
            f"/api/v1/submissions/{sub_id}/submit",
            headers=auth_headers(team_member),
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "pending"
    assert data["ai_score"] == 78
    assert data["ai_scorecard"]["score"] == 78
    assert len(data["ai_scorecard"]["suggestions"]) == 1
    assert data["ai_scorecard"]["rewrite"] == "[AI rewritten document]"
    assert data["workflow_stage"] == "submitted_to_founder"
    assert data["workflow_memory"]["score"] == 78


@pytest.mark.asyncio
async def test_analyze_draft(client: AsyncClient, team_member):
    with patch(
        "services.ai_service.AIService.review_document",
        new_callable=AsyncMock,
        return_value=MOCK_SCORECARD,
    ):
        resp = await client.post(
            "/api/v1/submissions/analyze-draft",
            json=SUBMISSION_PAYLOAD,
            headers=auth_headers(team_member),
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["score"] == 78
    assert data["grammar_check"]["score"] == 17
    assert data["workflow_stage"] == "awaiting_human_input"
    assert len(data["suggestions"]) == 1


@pytest.mark.asyncio
async def test_generate_draft_can_run_autonomously_with_thinking_instructions(client: AsyncClient, team_member):
    with patch(
        "services.ai_service.AIService.generate_draft",
        new_callable=AsyncMock,
        return_value="[autonomous draft]",
    ) as mock_generate:
        resp = await client.post(
            "/api/v1/submissions/generate-draft",
            json={
                "doc_type": "cold_email",
                "stakeholder": "principal",
                "context_form_data": {"fields": {"recipient_name_designation": "Dr Priya Sharma"}},
                "llm_mode": "autonomous",
                "thinking_instructions": "Think like a senior editor and do not ask for clarification.",
            },
            headers=auth_headers(team_member),
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["draft"] == "[autonomous draft]"
    assert data["workflow_memory"]["llm_mode"] == "autonomous"
    assert data["workflow_memory"]["thinking_instructions"] == "Think like a senior editor and do not ask for clarification."
    mock_generate.assert_awaited()
    assert mock_generate.await_args.kwargs["llm_mode"] == "autonomous"
    assert mock_generate.await_args.kwargs["thinking_instructions"] == "Think like a senior editor and do not ask for clarification."


@pytest.mark.asyncio
async def test_refine_draft_accepts_thinking_instructions(client: AsyncClient, team_member):
    with patch(
        "services.ai_service.AIService.refine_draft",
        new_callable=AsyncMock,
        return_value="[refined draft]",
    ) as mock_refine:
        resp = await client.post(
            "/api/v1/submissions/refine-draft",
            json={
                "content": "Please rewrite this sentence.",
                "action": "regenerate",
                "doc_type": "cold_email",
                "stakeholder": "principal",
                "thinking_instructions": "Keep the tone calm and practical.",
            },
            headers=auth_headers(team_member),
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["draft"] == "[refined draft]"
    mock_refine.assert_awaited()
    assert mock_refine.await_args.kwargs["request"].thinking_instructions == "Keep the tone calm and practical."


@pytest.mark.asyncio
async def test_existing_draft_precheck_is_reused_on_submit(client: AsyncClient, team_member):
    create_resp = await client.post(
        "/api/v1/submissions/",
        json={
            **SUBMISSION_PAYLOAD,
            "ai_precheck": MOCK_SCORECARD.model_dump(),
            "precheck_workflow_memory": {"trace": {"graph_name": "draft_review"}},
        },
        headers=auth_headers(team_member),
    )
    assert create_resp.status_code == 201
    sub_id = create_resp.json()["id"]

    with patch(
        "services.ai_service.AIService.review_document",
        new_callable=AsyncMock,
        side_effect=AssertionError("review_document should not be called when precheck is already persisted"),
    ):
        submit_resp = await client.post(
            f"/api/v1/submissions/{sub_id}/submit",
            headers=auth_headers(team_member),
        )

    assert submit_resp.status_code == 200
    data = submit_resp.json()
    assert data["ai_score"] == 78
    assert data["ai_scorecard"]["grammar_check"]["score"] == 17
    assert data["status"] == "pending"


@pytest.mark.asyncio
async def test_founder_can_approve(client: AsyncClient, team_member, founder_user):
    # Create + submit
    create_resp = await client.post(
        "/api/v1/submissions/",
        json=SUBMISSION_PAYLOAD,
        headers=auth_headers(team_member),
    )
    sub_id = create_resp.json()["id"]

    with patch(
        "services.ai_service.AIService.review_document",
        new_callable=AsyncMock,
        return_value=MOCK_SCORECARD,
    ):
        await client.post(
            f"/api/v1/submissions/{sub_id}/submit",
            headers=auth_headers(team_member),
        )

    # Approve
    resp = await client.post(
        f"/api/v1/submissions/{sub_id}/review",
        json={"action": "approve"},
        headers=auth_headers(founder_user),
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "approved"


@pytest.mark.asyncio
async def test_founder_can_update_visibility_after_approval(client: AsyncClient, team_member, founder_user):
    create_resp = await client.post(
        "/api/v1/submissions/",
        json=SUBMISSION_PAYLOAD,
        headers=auth_headers(team_member),
    )
    sub_id = create_resp.json()["id"]

    with patch(
        "services.ai_service.AIService.review_document",
        new_callable=AsyncMock,
        return_value=MOCK_SCORECARD,
    ):
        await client.post(
            f"/api/v1/submissions/{sub_id}/submit",
            headers=auth_headers(team_member),
        )

    approve_resp = await client.post(
        f"/api/v1/submissions/{sub_id}/review",
        json={"action": "approve"},
        headers=auth_headers(founder_user),
    )
    assert approve_resp.status_code == 200

    update_resp = await client.patch(
        f"/api/v1/submissions/{sub_id}/visibility",
        json={"visible_to_departments": ["marketing"]},
        headers=auth_headers(founder_user),
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["visibility"]["visible_to_departments"] == ["marketing"]


@pytest.mark.asyncio
async def test_rejected_submission_returns_founder_feedback_to_member(client: AsyncClient, team_member, founder_user):
    create_resp = await client.post(
        "/api/v1/submissions/",
        json=SUBMISSION_PAYLOAD,
        headers=auth_headers(team_member),
    )
    sub_id = create_resp.json()["id"]

    with patch(
        "services.ai_service.AIService.review_document",
        new_callable=AsyncMock,
        return_value=MOCK_SCORECARD,
    ):
        await client.post(
            f"/api/v1/submissions/{sub_id}/submit",
            headers=auth_headers(team_member),
        )

    with patch(
        "services.submission_workflow_service.SubmissionWorkflowService.generate_rejection_note",
        new_callable=AsyncMock,
        return_value="Please tighten the opening and make the CTA clearer.",
    ):
        review_resp = await client.post(
            f"/api/v1/submissions/{sub_id}/review",
            json={"action": "reject", "founder_note": "Please simplify the tone and sharpen the CTA."},
            headers=auth_headers(founder_user),
        )

    assert review_resp.status_code == 200
    assert review_resp.json()["feedback"]["founder_note"] == "Please simplify the tone and sharpen the CTA."
    assert review_resp.json()["feedback"]["ai_generated_note"] == "Please tighten the opening and make the CTA clearer."

    detail_resp = await client.get(
        f"/api/v1/submissions/{sub_id}",
        headers=auth_headers(team_member),
    )
    assert detail_resp.status_code == 200
    assert detail_resp.json()["feedback"]["founder_note"] == "Please simplify the tone and sharpen the CTA."
    assert detail_resp.json()["feedback"]["ai_generated_note"] == "Please tighten the opening and make the CTA clearer."


@pytest.mark.asyncio
async def test_founder_cannot_create_submission(client: AsyncClient, founder_user):
    resp = await client.post(
        "/api/v1/submissions/",
        json=SUBMISSION_PAYLOAD,
        headers=auth_headers(founder_user),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_team_member_cannot_review(client: AsyncClient, team_member):
    resp = await client.post(
        "/api/v1/submissions/00000000-0000-0000-0000-000000000000/review",
        json={"action": "approve"},
        headers=auth_headers(team_member),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_team_member_cannot_see_others_submissions(
    client: AsyncClient, team_member, other_team_member
):
    # Another team member creates a submission
    create_resp = await client.post(
        "/api/v1/submissions/",
        json=SUBMISSION_PAYLOAD,
        headers=auth_headers(other_team_member),
    )
    sub_id = create_resp.json()["id"]

    # Team member tries to fetch it
    resp = await client.get(
        f"/api/v1/submissions/{sub_id}",
        headers=auth_headers(team_member),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_founder_cannot_review_non_team_member_submission(
    client: AsyncClient, db_session, founder_user
):
    founder_submission_owner = User(
        name="Second Founder",
        email="second.founder@agilityai.in",
        hashed_password=hash_password("password123"),
        role=UserRole.FOUNDER,
        auth_provider=AuthProvider.LOCAL,
    )
    db_session.add(founder_submission_owner)
    await db_session.commit()
    await db_session.refresh(founder_submission_owner)

    submission = Submission(
        user_id=founder_submission_owner.id,
        doc_type="cold_email",
        stakeholder=Stakeholder.PRINCIPAL,
        content=SUBMISSION_PAYLOAD["content"],
        status=SubmissionStatus.PENDING,
        version=1,
    )
    db_session.add(submission)
    await db_session.commit()
    await db_session.refresh(submission)

    resp = await client.post(
        f"/api/v1/submissions/{submission.id}/review",
        json={"action": "approve"},
        headers=auth_headers(founder_user),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_my_submissions(client: AsyncClient, team_member):
    await client.post(
        "/api/v1/submissions/",
        json=SUBMISSION_PAYLOAD,
        headers=auth_headers(team_member),
    )
    resp = await client.get(
        "/api/v1/submissions/my",
        headers=auth_headers(team_member),
    )
    assert resp.status_code == 200
    assert len(resp.json()) >= 1

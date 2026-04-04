"""Tests — Submissions (unit-level, AI calls mocked)"""

from unittest.mock import AsyncMock, patch
import pytest
from httpx import AsyncClient

from models.models import AuthProvider, Stakeholder, Submission, SubmissionStatus, User, UserRole
from core.security import hash_password
from schemas.submission import AIScorecardResponse, ScoreBreakdown, AISuggestion
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
    assert data["workflow_stage"] == "awaiting_human_input"
    assert len(data["suggestions"]) == 1


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

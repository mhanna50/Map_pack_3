from __future__ import annotations

from backend.app.models.enums import ApprovalStatus, OrganizationType, ReviewRating, ReviewStatus
from backend.app.models.location import Location
from backend.app.models.organization import Organization
from backend.app.models.review import Review
from backend.app.models.user import User
from backend.app.services.approvals import ApprovalService


def _setup_context(db_session):
    staff = User(email="approval-admin@example.com", is_staff=True)
    db_session.add(staff)
    org = Organization(name="Approval Org", org_type=OrganizationType.AGENCY)
    db_session.add(org)
    db_session.flush()
    location = Location(name="Approval Location", organization_id=org.id, timezone="UTC")
    db_session.add(location)
    db_session.flush()
    review = Review(
        organization_id=org.id,
        location_id=location.id,
        external_review_id="reviews/1",
        rating=ReviewRating.ONE,
        comment="Terrible service",
        author_name="Alex",
        status=ReviewStatus.NEEDS_APPROVAL,
    )
    db_session.add(review)
    db_session.commit()
    return staff, org, location, review


def test_admin_approval_queue_flow(api_client, db_session):
    staff, org, location, review = _setup_context(db_session)
    approval = ApprovalService(db_session).queue_review_reply(review, suggested_reply="We are sorry.")

    list_resp = api_client.get(
        "/api/admin/approvals",
        params={"user_id": str(staff.id), "status": ApprovalStatus.PENDING.value},
    )
    assert list_resp.status_code == 200
    approvals = list_resp.json()
    assert approvals and approvals[0]["severity"] == "critical"

    patch_resp = api_client.patch(
        f"/api/admin/approvals/{approval.id}",
        json={
            "action": "approve",
            "user_id": str(staff.id),
            "content": "Custom reply",
        },
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["approved_content"] == "Custom reply"

    publish_resp = api_client.post(
        f"/api/admin/approvals/{approval.id}/publish",
        json={
            "user_id": str(staff.id),
            "external_id": "reviews/1/reply",
        },
    )
    assert publish_resp.status_code == 200
    body = publish_resp.json()
    assert body["published_external_id"] == "reviews/1/reply"
    assert body["status"] == ApprovalStatus.APPROVED.value

    db_session.refresh(review)
    assert review.reply_comment == "Custom reply"
    assert review.status == ReviewStatus.APPROVED

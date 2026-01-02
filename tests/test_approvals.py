from __future__ import annotations

from backend.app.models.approval_request import ApprovalRequest
from backend.app.models.enums import ApprovalCategory, ApprovalStatus, OrganizationType, ReviewRating
from backend.app.models.location import Location
from backend.app.models.organization import Organization
from backend.app.models.review import Review
from backend.app.services.approvals import ApprovalService
from backend.app.services.reviews import ReviewService


def _setup_org_and_location(db_session):
    org = Organization(name="Approval Org", org_type=OrganizationType.AGENCY)
    db_session.add(org)
    db_session.flush()
    location = Location(name="Approval Location", organization_id=org.id, timezone="UTC")
    db_session.add(location)
    db_session.commit()
    return org, location


def test_create_and_approve_request(db_session):
    org, location = _setup_org_and_location(db_session)
    service = ApprovalService(db_session)
    request = service.create_request(
        organization_id=org.id,
        location_id=location.id,
        category=ApprovalCategory.GBP_EDIT,
        reason="Sensitive change",
        payload={"field": "description"},
    )
    assert request.status == ApprovalStatus.PENDING

    approved = service.approve(request, approved_by=None, notes="Looks good")
    assert approved.status == ApprovalStatus.APPROVED
    assert approved.resolution_notes == "Looks good"


def test_queue_review_reply_from_review_service(db_session):
    org, location = _setup_org_and_location(db_session)
    review_service = ReviewService(db_session)
    review = review_service.ingest_review(
        organization_id=org.id,
        location_id=location.id,
        external_review_id="r-123",
        rating=ReviewRating.ONE,
        comment="Bad",
        author_name="Alex",
        metadata=None,
    )
    reply = review_service.auto_reply_positive(review, template="Thanks {name}")
    assert reply is None
    approvals = db_session.query(ApprovalRequest).all()
    assert approvals and approvals[0].category == ApprovalCategory.REVIEW_REPLY


def test_rollback_records_state(db_session):
    org, location = _setup_org_and_location(db_session)
    service = ApprovalService(db_session)
    request = service.create_request(
        organization_id=org.id,
        location_id=location.id,
        category=ApprovalCategory.AI_CONTENT,
        reason="Sensitive text",
        before_state={"body": "old"},
    )
    rolled = service.rollback(request, notes="Undid change")
    assert rolled.status == ApprovalStatus.ROLLED_BACK
    assert rolled.resolution_notes == "Undid change"

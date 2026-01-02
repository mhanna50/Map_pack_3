from __future__ import annotations

from datetime import datetime, timezone

from backend.app.models.action import Action
from backend.app.models.approval_request import ApprovalRequest
from backend.app.models.enums import (
    ActionStatus,
    ActionType,
    ApprovalCategory,
    ApprovalStatus,
    MembershipRole,
    OrganizationType,
    PostStatus,
    PostType,
    ReviewRating,
)
from backend.app.models.location import Location
from backend.app.models.membership import Membership
from backend.app.models.organization import Organization
from backend.app.models.post import Post
from backend.app.models.review import Review
from backend.app.models.user import User
from backend.app.models.visibility_score import VisibilityScore
from backend.app.models.location_keyword import LocationKeyword
from backend.app.services.dashboard import DashboardService


def _setup_context(db_session):
    user = User(email="owner@example.com")
    db_session.add(user)
    org = Organization(name="Dash Org", org_type=OrganizationType.AGENCY, plan_tier="growth")
    db_session.add(org)
    db_session.flush()
    membership = Membership(user_id=user.id, organization_id=org.id, role=MembershipRole.OWNER)
    db_session.add(membership)
    location = Location(name="HQ", organization_id=org.id, timezone="UTC")
    db_session.add(location)
    db_session.commit()
    return user, org, location


def test_dashboard_service_overview(db_session):
    user, org, location = _setup_context(db_session)
    post = Post(
        organization_id=org.id,
        location_id=location.id,
        post_type=PostType.UPDATE,
        body="Update",
        status=PostStatus.PUBLISHED,
        publish_result={"engagement": 10},
    )
    db_session.add(post)
    review = Review(
        organization_id=org.id,
        location_id=location.id,
        external_review_id="rev-1",
        rating=ReviewRating.ONE,
        comment="Bad",
        reply_comment="",
        reply_submitted_at=datetime.now(timezone.utc).isoformat(),
    )
    db_session.add(review)
    approval = ApprovalRequest(
        organization_id=org.id,
        location_id=location.id,
        category=ApprovalCategory.REVIEW_REPLY,
        status=ApprovalStatus.PENDING,
        reason="Needs approval",
    )
    db_session.add(approval)
    keyword = LocationKeyword(
        organization_id=org.id,
        location_id=location.id,
        keyword="hvac",
    )
    db_session.add(keyword)
    db_session.commit()
    visibility = VisibilityScore(
        organization_id=org.id,
        location_id=location.id,
        keyword_id=keyword.id,
        computed_at=datetime.now(timezone.utc),
        score=75.0,
    )
    db_session.add(visibility)
    upcoming_action = Action(
        organization_id=org.id,
        location_id=location.id,
        action_type=ActionType.CUSTOM,
        status=ActionStatus.PENDING,
        run_at=datetime.now(timezone.utc),
        payload={},
    )
    db_session.add(upcoming_action)
    db_session.commit()

    service = DashboardService(db_session)
    overview = service.get_overview(user_id=user.id, organization_id=org.id, location_id=location.id)
    assert overview["organization"]["name"] == org.name
    assert overview["kpis"]["posts"]["count"] >= 1
    assert any(task["type"] == "approvals" for task in overview["tasks"])

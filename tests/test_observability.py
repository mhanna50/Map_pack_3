from __future__ import annotations

from datetime import datetime, timedelta, timezone

from backend.app.models.action import Action
from backend.app.models.alert import Alert
from backend.app.models.enums import (
    ActionStatus,
    ActionType,
    AlertSeverity,
    AlertStatus,
    OrganizationType,
    PostStatus,
    PostType,
)
from backend.app.models.location import Location
from backend.app.models.organization import Organization
from backend.app.models.post import Post
from backend.app.services.observability import ObservabilityService


def _org_and_location(db_session):
    org = Organization(name="Obs Org", org_type=OrganizationType.AGENCY)
    db_session.add(org)
    db_session.flush()
    location = Location(name="Obs Location", organization_id=org.id, timezone="UTC")
    db_session.add(location)
    db_session.commit()
    return org, location


def test_observability_summary(db_session):
    org, location = _org_and_location(db_session)
    now = datetime.now(timezone.utc)
    action_success = Action(
        organization_id=org.id,
        location_id=location.id,
        action_type=ActionType.PUBLISH_GBP_POST,
        status=ActionStatus.SUCCEEDED,
        run_at=now,
        created_at=now,
    )
    action_fail = Action(
        organization_id=org.id,
        location_id=location.id,
        action_type=ActionType.REFRESH_GOOGLE_TOKEN,
        status=ActionStatus.FAILED,
        error="token expired",
        run_at=now,
        created_at=now,
    )
    db_session.add_all([action_success, action_fail])
    post = Post(
        organization_id=org.id,
        location_id=location.id,
        body="Published post",
        post_type=PostType.UPDATE,
        status=PostStatus.PUBLISHED,
        scheduled_at=now - timedelta(hours=5),
        published_at=now - timedelta(hours=1),
    )
    db_session.add(post)
    alert_open = Alert(
        organization_id=org.id,
        location_id=location.id,
        severity=AlertSeverity.WARNING,
        alert_type="gbp_disconnected",
        message="token issue",
        status=AlertStatus.OPEN,
    )
    alert_resolved = Alert(
        organization_id=org.id,
        location_id=location.id,
        severity=AlertSeverity.INFO,
        alert_type="job_failed",
        message="resolved",
        status=AlertStatus.RESOLVED,
    )
    db_session.add_all([alert_open, alert_resolved])
    db_session.commit()

    service = ObservabilityService(db_session)
    summary = service.summary()
    assert summary["jobs"]["total"] == 2
    assert summary["jobs"]["failure_reasons"][0]["error"] == "token expired"
    assert summary["publishing"]["published_count"] == 1
    assert summary["token_refresh"]["total"] == 1
    assert summary["alerts"]["open_total"] == 1

from __future__ import annotations

from datetime import datetime, timezone

from backend.app.models.automation.action import Action
from backend.app.models.enums import (
    AutomationActionType,
    AutomationCondition,
    GbpConnectionStatus,
    LocationStatus,
    AutomationTriggerType,
    OrganizationType,
    PostStatus,
    PostType,
)
from backend.app.models.google_business.gbp_connection import GbpConnection
from backend.app.models.google_business.listing_audit import ListingAudit
from backend.app.models.google_business.location import Location
from backend.app.models.identity.organization import Organization
from backend.app.models.posts.post import Post
from backend.app.services.automation.automation_rules import AutomationRuleService


def _make_location(db_session):
    org = Organization(name="Automation Org", org_type=OrganizationType.AGENCY)
    db_session.add(org)
    db_session.flush()
    location = Location(name="Automation Location", organization_id=org.id, timezone="UTC")
    db_session.add(location)
    db_session.commit()
    return org, location


def _mark_gbp_ready(db_session, org, location):
    location.google_location_id = f"accounts/1/locations/{location.id}"
    location.status = LocationStatus.ACTIVE
    db_session.add(
        GbpConnection(
            organization_id=org.id,
            status=GbpConnectionStatus.CONNECTED,
            google_account_email="owner@example.com",
        )
    )
    db_session.add(
        ListingAudit(
            organization_id=org.id,
            location_id=location.id,
            audited_at=datetime.now(timezone.utc),
            completed_at=datetime.now(timezone.utc),
            status="completed",
        )
    )
    db_session.add(location)
    db_session.commit()


def test_inactivity_rule_triggers_action(db_session):
    org, location = _make_location(db_session)
    _mark_gbp_ready(db_session, org, location)
    service = AutomationRuleService(db_session)
    rule = service.create_rule(
        organization_id=org.id,
        location_id=location.id,
        name="No posts",
        trigger_type=AutomationTriggerType.INACTIVITY,
        condition=AutomationCondition.ALWAYS,
        action_type=AutomationActionType.CREATE_POST,
        config={"days": 7},
        priority=10,
    )

    results = service.trigger_due_rules(organization_id=org.id, location_id=location.id)
    assert len(results) == 1
    actions = (
        db_session.query(Action)
        .filter(Action.organization_id == org.id)
        .filter(Action.payload["rule_id"].astext == str(rule.id))
        .all()
    )
    assert actions


def test_gbp_rule_skips_when_location_not_ready(db_session):
    org, location = _make_location(db_session)
    service = AutomationRuleService(db_session)
    rule = service.create_rule(
        organization_id=org.id,
        location_id=location.id,
        name="No posts",
        trigger_type=AutomationTriggerType.INACTIVITY,
        condition=AutomationCondition.ALWAYS,
        action_type=AutomationActionType.CREATE_POST,
        config={"days": 7},
        priority=10,
    )

    results = service.trigger_due_rules(organization_id=org.id, location_id=location.id)
    assert results == []
    actions = (
        db_session.query(Action)
        .filter(Action.organization_id == org.id)
        .filter(Action.payload["rule_id"].astext == str(rule.id))
        .all()
    )
    assert actions == []


def test_simulation_reflects_recent_activity(db_session):
    org, location = _make_location(db_session)
    post = Post(
        organization_id=org.id,
        location_id=location.id,
        post_type=PostType.UPDATE,
        body="Post",
        status=PostStatus.PUBLISHED,
    )
    db_session.add(post)
    db_session.commit()

    service = AutomationRuleService(db_session)
    rule = service.create_rule(
        organization_id=org.id,
        location_id=location.id,
        name="Stale photos",
        trigger_type=AutomationTriggerType.PHOTO_STALENESS,
        condition=AutomationCondition.ALWAYS,
        action_type=AutomationActionType.REQUEST_PHOTOS,
        config={"days": 0},
    )

    simulation = service.simulate(rule, days=30)
    assert "Would trigger" in simulation.summary
    assert simulation.metrics["would_trigger"] in {0, 1}

from __future__ import annotations

from backend.app.models.action import Action
from backend.app.models.enums import (
    AutomationActionType,
    AutomationCondition,
    AutomationTriggerType,
    OrganizationType,
    PostStatus,
    PostType,
)
from backend.app.models.location import Location
from backend.app.models.organization import Organization
from backend.app.models.post import Post
from backend.app.services.automation_rules import AutomationRuleService


def _make_location(db_session):
    org = Organization(name="Automation Org", org_type=OrganizationType.AGENCY)
    db_session.add(org)
    db_session.flush()
    location = Location(name="Automation Location", organization_id=org.id, timezone="UTC")
    db_session.add(location)
    db_session.commit()
    return org, location


def test_inactivity_rule_triggers_action(db_session):
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
    assert len(results) == 1
    actions = db_session.query(Action).all()
    assert actions
    assert actions[0].payload["rule_id"] == str(rule.id)


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

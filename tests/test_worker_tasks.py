from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from backend.app.models.action import Action as ActionModel
from backend.app.models.enums import (
    ActionStatus,
    ActionType,
    AutomationActionType,
    AutomationCondition,
    AutomationTriggerType,
    OrganizationType,
)
from backend.app.models.organization import Organization
from backend.app.models.location import Location
from backend.app.models.location_settings import LocationSettings
from backend.app.services.media_management import MediaManagementService
from backend.app.services.competitor_monitoring import CompetitorMonitoringService
from backend.app.services.automation_rules import AutomationRuleService
from backend.app.services.actions import ActionService
from worker.app import tasks as worker_tasks


def test_dispatch_due_actions_triggers_execution(
    db_session, worker_session_factory, monkeypatch
):
    org = Organization(name="Worker Org", org_type=OrganizationType.AGENCY)
    db_session.add(org)
    db_session.commit()
    service = ActionService(db_session)
    action = service.schedule_action(
        organization_id=org.id,
        action_type=ActionType.CUSTOM,
        run_at=datetime.now(timezone.utc) - timedelta(minutes=1),
    )

    triggered: list[str] = []

    class StubTask:
        @staticmethod
        def delay(action_id: str):
            triggered.append(action_id)

    monkeypatch.setattr(worker_tasks, "execute_action", StubTask())

    result = worker_tasks._dispatch_due_actions()
    assert result["dispatched"] == 1
    assert triggered == [str(action.id)]


def test_execute_action_marks_success(db_session, worker_session_factory):
    org = Organization(name="Exec Org", org_type=OrganizationType.AGENCY)
    db_session.add(org)
    db_session.commit()
    service = ActionService(db_session)
    action = service.schedule_action(
        organization_id=org.id,
        action_type=ActionType.CUSTOM,
        run_at=datetime.now(timezone.utc) - timedelta(minutes=1),
    )

    result = worker_tasks._execute_action(str(action.id))
    assert result["status"] in {"no-op", "queued_for_google", "token_refresh_stubbed"}
    db_session.refresh(action)
    assert action.status == ActionStatus.SUCCEEDED


def test_execute_action_dead_letters_on_failure(
    db_session, worker_session_factory, monkeypatch
):
    org = Organization(name="DLQ Org", org_type=OrganizationType.AGENCY)
    db_session.add(org)
    db_session.commit()
    service = ActionService(db_session)
    action = service.schedule_action(
        organization_id=org.id,
        action_type=ActionType.CUSTOM,
        run_at=datetime.now(timezone.utc) - timedelta(minutes=1),
        max_attempts=1,
    )

    def boom(self, action):
        raise RuntimeError("boom")

    monkeypatch.setattr(worker_tasks.ActionExecutor, "execute", boom, raising=False)

    with pytest.raises(RuntimeError):
        worker_tasks._execute_action(str(action.id))

    db_session.refresh(action)
    assert action.status == ActionStatus.DEAD_LETTERED


def test_media_upload_request_action_marks_notified(db_session, worker_session_factory):
    org = Organization(name="Media Action Org", org_type=OrganizationType.AGENCY)
    db_session.add(org)
    db_session.flush()
    location = Location(name="Action Location", organization_id=org.id, timezone="UTC")
    db_session.add(location)
    db_session.commit()
    media_service = MediaManagementService(db_session)
    request = media_service.request_upload_if_stale(
        organization_id=org.id,
        location_id=location.id,
        days_without_upload=0,
    )
    assert request is not None, "Expected a media upload request to be created"
    service = ActionService(db_session)
    action = service.schedule_action(
        organization_id=org.id,
        action_type=ActionType.REQUEST_MEDIA_UPLOAD,
        run_at=datetime.now(timezone.utc) - timedelta(minutes=1),
        payload={"media_upload_request_id": str(request.id)},
        location_id=location.id,
    )

    worker_tasks._execute_action(str(action.id))

    db_session.refresh(request)
    assert request.notified_at is not None


def test_competitor_monitor_action_creates_snapshots(db_session, worker_session_factory):
    org = Organization(name="Compete Action Org", org_type=OrganizationType.AGENCY)
    db_session.add(org)
    db_session.flush()
    location = Location(name="Compete Location", organization_id=org.id, timezone="UTC")
    db_session.add(location)
    db_session.flush()
    settings = LocationSettings(location_id=location.id, posting_schedule={"days": ["mon"]})
    db_session.add(settings)
    db_session.commit()
    monitor_service = CompetitorMonitoringService(db_session)
    monitor_service.auto_discover_competitors(
        organization_id=org.id, location_id=location.id, top_n=1
    )
    action_service = ActionService(db_session)
    action = action_service.schedule_action(
        organization_id=org.id,
        action_type=ActionType.MONITOR_COMPETITORS,
        run_at=datetime.now(timezone.utc) - timedelta(minutes=1),
        payload={"location_id": str(location.id)},
        location_id=location.id,
    )

    worker_tasks._execute_action(str(action.id))

    snapshots = monitor_service.list_snapshots(location_id=location.id)
    assert snapshots


def test_run_automation_rules_action_triggers_rules(db_session, worker_session_factory):
    org = Organization(name="Automation Worker Org", org_type=OrganizationType.AGENCY)
    db_session.add(org)
    db_session.flush()
    location = Location(name="Automation Worker Location", organization_id=org.id, timezone="UTC")
    db_session.add(location)
    db_session.commit()
    rule_service = AutomationRuleService(db_session)
    rule_service.create_rule(
        organization_id=org.id,
        location_id=location.id,
        name="Worker rule",
        trigger_type=AutomationTriggerType.INACTIVITY,
        condition=AutomationCondition.ALWAYS,
        action_type=AutomationActionType.CREATE_POST,
    )
    action_service = ActionService(db_session)
    action = action_service.schedule_action(
        organization_id=org.id,
        action_type=ActionType.RUN_AUTOMATION_RULES,
        run_at=datetime.now(timezone.utc) - timedelta(minutes=1),
        payload={"organization_id": str(org.id), "location_id": str(location.id)},
        location_id=location.id,
    )

    worker_tasks._execute_action(str(action.id))

    actions = db_session.query(ActionModel).filter(ActionModel.action_type == ActionType.PUBLISH_GBP_POST).all()
    assert actions


def test_schedule_automation_rules_creates_actions(db_session, worker_session_factory):
    org = Organization(name="Schedule Org", org_type=OrganizationType.AGENCY)
    db_session.add(org)
    db_session.commit()

    result = worker_tasks._schedule_automation_rules()
    assert result["scheduled"] >= 1

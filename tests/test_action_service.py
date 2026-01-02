from __future__ import annotations

from datetime import datetime, timedelta, timezone

from backend.app.models.enums import ActionStatus, ActionType, OrganizationType
from backend.app.models.organization import Organization
from backend.app.services.actions import ActionService


def test_action_lifecycle_retry_and_dead_letter(db_session):
    org = Organization(name="Test Org", org_type=OrganizationType.AGENCY)
    db_session.add(org)
    db_session.commit()

    service = ActionService(db_session)
    run_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    action = service.schedule_action(
        organization_id=org.id,
        action_type=ActionType.CUSTOM,
        run_at=run_at,
        payload={"foo": "bar"},
    )
    assert action.status == ActionStatus.PENDING

    due_actions = service.fetch_due_actions(limit=5)
    assert len(due_actions) == 1
    current = due_actions[0]
    assert current.status == ActionStatus.QUEUED

    service.mark_running(current)
    assert current.status == ActionStatus.RUNNING
    service.mark_failure(current, "transient error")
    db_session.refresh(current)
    assert current.status == ActionStatus.PENDING
    assert current.next_run_at is not None
    assert _ensure_aware(current.run_at) >= datetime.now(timezone.utc)
    assert current.attempts == 1

    current.attempts = current.max_attempts
    db_session.add(current)
    db_session.commit()
    service.mark_failure(current, "final error")
    db_session.refresh(current)
    assert current.status == ActionStatus.DEAD_LETTERED
    assert current.next_run_at is None


def test_mark_success_records_results(db_session):
    org = Organization(name="Result Org", org_type=OrganizationType.AGENCY)
    db_session.add(org)
    db_session.commit()

    service = ActionService(db_session)
    run_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    action = service.schedule_action(
        organization_id=org.id,
        action_type=ActionType.CUSTOM,
        run_at=run_at,
    )

    due_action = service.fetch_due_actions(limit=1)[0]
    service.mark_running(due_action)
    result_payload = {"status": "ok"}
    service.mark_success(due_action, result=result_payload)
    db_session.refresh(due_action)

    assert due_action.status == ActionStatus.SUCCEEDED
    assert due_action.result == result_payload
    assert due_action.error is None
def _ensure_aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)

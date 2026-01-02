import uuid
from datetime import datetime, timezone
from typing import Any, Dict, cast

from celery.app.task import Task
from celery.utils.log import get_task_logger

from .celery_app import celery_app
from backend.app.core.config import settings
from backend.app.db.session import SessionLocal
from backend.app.models.action import Action
from backend.app.models.enums import ActionStatus, ActionType
from backend.app.models.organization import Organization
from backend.app.services.actions import ActionExecutor, ActionService

logger = get_task_logger(__name__)


def _dispatch_due_actions() -> Dict[str, int]:
    db = SessionLocal()
    try:
        service = ActionService(db)
        actions = service.fetch_due_actions(settings.ACTION_DISPATCH_BATCH_SIZE)
        dispatched = 0
        for action in actions:
            execute_action.delay(str(action.id))
            dispatched += 1
        return {"dispatched": dispatched}
    finally:
        db.close()


def _execute_action(action_id: str) -> Dict[str, Any]:
    db = SessionLocal()
    service = ActionService(db)
    executor = ActionExecutor(db)
    action: Action | None = None
    try:
        action = db.get(Action, uuid.UUID(action_id))
        if not action:
            logger.warning("Action %s not found", action_id)
            return {"status": "missing"}
        if action.status in {
            ActionStatus.SUCCEEDED,
            ActionStatus.CANCELLED,
            ActionStatus.DEAD_LETTERED,
        }:
            logger.info("Skipping action %s with status %s", action_id, action.status)
            return {"status": action.status.value}
        service.mark_running(action)
        result = executor.execute(action)
        service.mark_success(action, result=result)
        return result
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        if action:
            service.mark_failure(action, str(exc))
        logger.exception("Action %s failed", action_id)
        raise
    finally:
        db.close()


def _schedule_automation_rules() -> Dict[str, int]:
    db = SessionLocal()
    scheduled = 0
    try:
        service = ActionService(db)
        org_ids = [org_id for (org_id,) in db.query(Organization.id).all()]
        for org_id in org_ids:
            service.schedule_action(
                organization_id=org_id,
                action_type=ActionType.RUN_AUTOMATION_RULES,
                run_at=datetime.now(timezone.utc),
                payload={"organization_id": str(org_id)},
            )
            scheduled += 1
        return {"scheduled": scheduled}
    finally:
        db.close()


dispatch_due_actions = cast(
    Task, celery_app.task(name="actions.dispatch_due")(_dispatch_due_actions)
)
execute_action = cast(Task, celery_app.task(name="actions.execute")(_execute_action))
sched_automation_rules = cast(
    Task, celery_app.task(name="actions.schedule_automation_rules")(_schedule_automation_rules)
)

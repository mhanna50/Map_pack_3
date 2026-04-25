from celery import Celery
from celery.schedules import crontab

from backend.app.core.config import settings

broker = settings.CELERY_BROKER_URL
backend = settings.CELERY_RESULT_BACKEND

celery_app = Celery(
    "worker",
    broker=broker,
    backend=backend,
    include=["worker.app.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
)

celery_app.conf.beat_schedule = {
    "dispatch-due-actions": {
        "task": "actions.dispatch_due",
        "schedule": crontab(),  # every minute
    },
    "schedule-automation-rules": {
        "task": "actions.schedule_automation_rules",
        "schedule": crontab(minute="*/15"),
    },
    "plan-content-daily": {
        "task": "actions.plan_content",
        "schedule": crontab(minute=0, hour="*/4"),  # every 4 hours
    },
    "connection-health": {
        "task": "actions.connection_health",
        "schedule": crontab(minute="*/30"),
    },
    "schedule-keyword-campaigns-monthly": {
        "task": "actions.schedule_keyword_campaigns_monthly",
        "schedule": crontab(minute=10, hour=2, day_of_month="1"),
    },
    "schedule-keyword-campaigns-onboarding": {
        "task": "actions.schedule_keyword_campaigns_onboarding",
        "schedule": crontab(minute="*/10"),
    },
}

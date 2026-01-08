from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.app.models.action import Action
from backend.app.models.alert import Alert
from backend.app.models.enums import ActionStatus, ActionType, AlertStatus
from backend.app.models.post import Post


class ObservabilityService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def summary(self, *, window_hours: int = 24) -> dict:
        window_start = datetime.now(timezone.utc) - timedelta(hours=window_hours)
        publish_window = datetime.now(timezone.utc) - timedelta(days=7)
        return {
            "jobs": self._job_metrics(window_start),
            "publishing": self._publishing_metrics(publish_window),
            "token_refresh": self._token_refresh_metrics(window_start),
            "alerts": self._alert_metrics(),
            "window_hours": window_hours,
        }

    def _job_metrics(self, window_start: datetime) -> dict:
        total = (
            self.db.query(func.count(Action.id))
            .filter(Action.created_at >= window_start)
            .scalar()
            or 0
        )
        succeeded = (
            self.db.query(func.count(Action.id))
            .filter(Action.created_at >= window_start)
            .filter(Action.status == ActionStatus.SUCCEEDED)
            .scalar()
            or 0
        )
        failed = (
            self.db.query(func.count(Action.id))
            .filter(Action.created_at >= window_start)
            .filter(Action.status.in_([ActionStatus.FAILED, ActionStatus.DEAD_LETTERED]))
            .scalar()
            or 0
        )
        queue_depth = (
            self.db.query(func.count(Action.id))
            .filter(Action.status.in_([ActionStatus.PENDING, ActionStatus.QUEUED]))
            .scalar()
            or 0
        )
        failure_reasons = [
            {"error": error or "unknown", "count": count}
            for error, count in (
                self.db.query(Action.error, func.count(Action.id))
                .filter(Action.created_at >= window_start)
                .filter(Action.status.in_([ActionStatus.FAILED, ActionStatus.DEAD_LETTERED]))
                .group_by(Action.error)
                .order_by(func.count(Action.id).desc())
                .limit(5)
                .all()
            )
        ]
        success_rate = succeeded / total if total else 1.0
        return {
            "total": total,
            "succeeded": succeeded,
            "failed": failed,
            "success_rate": round(success_rate, 3),
            "queue_depth": queue_depth,
            "failure_reasons": failure_reasons,
        }

    def _publishing_metrics(self, window_start: datetime) -> dict:
        posts = (
            self.db.query(Post)
            .filter(Post.published_at != None)  # noqa: E711
            .filter(Post.published_at >= window_start)
            .all()
        )
        latencies: list[float] = []
        for post in posts:
            published_at = post.published_at or datetime.now(timezone.utc)
            scheduled = post.scheduled_at or post.created_at or published_at
            if scheduled.tzinfo is None:
                scheduled = scheduled.replace(tzinfo=timezone.utc)
            if published_at.tzinfo is None:
                published_at = published_at.replace(tzinfo=timezone.utc)
            latency = (published_at - scheduled).total_seconds() / 3600
            if latency >= 0:
                latencies.append(latency)
        average_hours = sum(latencies) / len(latencies) if latencies else None
        return {
            "published_count": len(posts),
            "average_time_to_publish_hours": round(average_hours, 2) if average_hours is not None else None,
        }

    def _token_refresh_metrics(self, window_start: datetime) -> dict:
        query = (
            self.db.query(Action)
            .filter(Action.created_at >= window_start)
            .filter(Action.action_type == ActionType.REFRESH_GOOGLE_TOKEN)
        )
        total = query.count()
        success = query.filter(Action.status == ActionStatus.SUCCEEDED).count()
        failures = query.filter(Action.status.in_([ActionStatus.FAILED, ActionStatus.DEAD_LETTERED])).count()
        return {
            "total": total,
            "success": success,
            "failure": failures,
            "success_rate": round(success / total, 3) if total else 1.0,
        }

    def _alert_metrics(self) -> dict:
        counts = (
            self.db.query(Alert.alert_type, func.count(Alert.id))
            .filter(Alert.status != AlertStatus.RESOLVED)
            .group_by(Alert.alert_type)
            .all()
        )
        return {
            "open_by_type": {alert_type: count for alert_type, count in counts},
            "open_total": sum(count for _, count in counts),
        }

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import uuid

from sqlalchemy.orm import Session

from backend.app.models.enums import PostStatus
from backend.app.models.post import Post


class AutoScheduler:
    """Decides the next GBP post time using recent activity and guardrails."""

    MIN_INTERVAL = timedelta(hours=18)
    MAX_INTERVAL = timedelta(hours=72)
    DEFAULT_INTERVAL = timedelta(hours=36)

    def __init__(self, db: Session) -> None:
        self.db = db

    def next_post_time(
        self,
        *,
        organization_id: uuid.UUID,
        location_id: uuid.UUID,
        now: datetime | None = None,
    ) -> datetime:
        del organization_id  # reserved for future org-level guardrails
        now = now or datetime.now(timezone.utc)
        interval = self._determine_interval(location_id=location_id, now=now)
        anchor = self._last_activity_timestamp(location_id=location_id, now=now)
        next_slot = anchor + interval
        if next_slot <= now:
            next_slot = now + interval
        return next_slot

    def _determine_interval(self, *, location_id: uuid.UUID, now: datetime) -> timedelta:
        window_start = now - timedelta(days=7)
        recent_posts = (
            self.db.query(Post)
            .filter(Post.location_id == location_id)
            .filter(Post.created_at >= window_start)
            .count()
        )
        if recent_posts <= 1:
            return self.MIN_INTERVAL
        if recent_posts >= 6:
            return self.MAX_INTERVAL
        return self.DEFAULT_INTERVAL

    def _last_activity_timestamp(self, *, location_id: uuid.UUID, now: datetime) -> datetime:
        active_statuses = [
            PostStatus.SCHEDULED,
            PostStatus.QUEUED,
            PostStatus.PUBLISHED,
        ]
        last_post = (
            self.db.query(Post)
            .filter(Post.location_id == location_id)
            .filter(Post.status.in_(active_statuses))
            .order_by(Post.scheduled_at.desc().nullslast(), Post.created_at.desc())
            .first()
        )
        if not last_post:
            return now
        if last_post.scheduled_at:
            return max(last_post.scheduled_at, now)
        if last_post.created_at:
            return max(last_post.created_at, now)
        return now

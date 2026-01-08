from __future__ import annotations

from datetime import datetime, timedelta, timezone
import uuid

from sqlalchemy.orm import Session

from backend.app.core.config import settings
from backend.app.models.location import Location
from backend.app.models.organization import Organization
from backend.app.models.post import Post


class PostingSafetyService:
    MAX_POSTS_PER_WEEK = 3
    MIN_GAP_HOURS = 48
    BUCKET_COOLDOWN_DAYS = 14

    def __init__(self, db: Session) -> None:
        self.db = db

    def validate(
        self,
        *,
        organization_id: uuid.UUID,
        location_id: uuid.UUID,
        scheduled_at: datetime | None,
        bucket: str | None,
    ) -> None:
        target_time = scheduled_at or datetime.now(timezone.utc)
        org = self.db.get(Organization, organization_id)
        location = self.db.get(Location, location_id)
        self._ensure_not_paused(org=org, location=location)
        cap = self._resolve_cap(org=org, location=location)
        self._enforce_post_frequency(location_id=location_id, target_time=target_time, cap=cap)
        self._enforce_min_gap(location_id=location_id, target_time=target_time)
        if bucket:
            self._enforce_bucket_cooldown(location_id=location_id, bucket=bucket, target_time=target_time)

    def ensure_not_paused(self, *, organization_id: uuid.UUID, location_id: uuid.UUID) -> None:
        org = self.db.get(Organization, organization_id)
        location = self.db.get(Location, location_id)
        self._ensure_not_paused(org=org, location=location)

    def _enforce_post_frequency(self, *, location_id: uuid.UUID, target_time: datetime, cap: int | None) -> None:
        limit = cap or self.MAX_POSTS_PER_WEEK
        window_start = target_time - timedelta(days=7)
        count = (
            self.db.query(Post)
            .filter(Post.location_id == location_id)
            .filter(Post.scheduled_at >= window_start)
            .count()
        )
        if count >= limit:
            raise ValueError("Maximum posts per week exceeded for this location")

    def _enforce_min_gap(self, *, location_id: uuid.UUID, target_time: datetime) -> None:
        last_post = (
            self.db.query(Post)
            .filter(Post.location_id == location_id)
            .filter(Post.scheduled_at != None)  # noqa: E711
            .order_by(Post.scheduled_at.desc())
            .first()
        )
        if last_post and last_post.scheduled_at:
            delta = target_time - last_post.scheduled_at
            if delta < timedelta(hours=self.MIN_GAP_HOURS):
                raise ValueError("Minimum gap between posts not satisfied")

    def _enforce_bucket_cooldown(self, *, location_id: uuid.UUID, bucket: str, target_time: datetime) -> None:
        cutoff = target_time - timedelta(days=self.BUCKET_COOLDOWN_DAYS)
        recent = (
            self.db.query(Post)
            .filter(Post.location_id == location_id, Post.bucket == bucket)
            .filter(Post.scheduled_at >= cutoff)
            .first()
        )
        if recent:
            raise ValueError("This bucket/topic was used too recently")

    def _ensure_not_paused(self, *, org: Organization | None, location: Location | None) -> None:
        if settings.GLOBAL_POSTING_PAUSE:
            raise ValueError("Posting is paused globally")
        if org and org.posting_paused:
            raise ValueError("Posting is paused for this organization")
        if location and location.posting_paused:
            raise ValueError("Posting is paused for this location")

    @staticmethod
    def _resolve_cap(*, org: Organization | None, location: Location | None) -> int | None:
        if location and location.posting_cap_per_week:
            return location.posting_cap_per_week
        if org and org.posting_cap_per_week:
            return org.posting_cap_per_week
        return None

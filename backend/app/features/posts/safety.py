from __future__ import annotations

from datetime import datetime, time, timedelta, timezone
from difflib import SequenceMatcher
import uuid
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy.orm import Session

from backend.app.core.config import settings
from backend.app.models.enums import PostStatus
from backend.app.models.google_business.location import Location
from backend.app.models.identity.organization import Organization
from backend.app.models.posts.post import Post


class PostingSafetyService:
    MAX_POSTS_PER_WEEK = 3
    MIN_GAP_HOURS = 48
    BUCKET_COOLDOWN_DAYS = 14
    CONTENT_REUSE_COOLDOWN_DAYS = 90
    SIMILARITY_THRESHOLD = 0.88
    PUBLISH_EARLY_TOLERANCE = timedelta(minutes=5)
    WINDOW_RANGES = {
        "morning": (time(8, 0), time(10, 0)),
        "midday": (time(11, 0), time(13, 0)),
        "afternoon": (time(15, 0), time(17, 0)),
        "evening": (time(18, 0), time(20, 0)),
    }
    ACTIVE_STATUSES = (PostStatus.SCHEDULED, PostStatus.QUEUED, PostStatus.PUBLISHED)

    def __init__(self, db: Session) -> None:
        self.db = db

    def validate(
        self,
        *,
        organization_id: uuid.UUID,
        location_id: uuid.UUID,
        scheduled_at: datetime | None,
        bucket: str | None,
        body: str | None = None,
        fingerprint: str | None = None,
        window_id: str | None = None,
    ) -> None:
        target_time = self._normalize_dt(scheduled_at or datetime.now(timezone.utc))
        org = self.db.get(Organization, organization_id)
        location = self.db.get(Location, location_id)
        self._ensure_not_paused(org=org, location=location)
        cap = self._resolve_cap(org=org, location=location)
        self._enforce_post_frequency(location_id=location_id, target_time=target_time, cap=cap)
        self._enforce_min_gap(location_id=location_id, target_time=target_time)
        self._enforce_schedule_window(location=location, target_time=target_time, window_id=window_id)
        if bucket:
            self._enforce_bucket_cooldown(location_id=location_id, bucket=bucket, target_time=target_time)
        if body:
            self._enforce_content_reuse(
                location_id=location_id,
                target_time=target_time,
                body=body,
                fingerprint=fingerprint,
            )

    def validate_publish_ready(self, post: Post, *, now: datetime | None = None) -> None:
        if post.status == PostStatus.PUBLISHED or post.published_at or post.external_post_id:
            return
        if post.status not in {PostStatus.SCHEDULED, PostStatus.QUEUED}:
            raise ValueError(f"Post status {post.status.value} is not publishable")
        now = self._normalize_dt(now or datetime.now(timezone.utc))
        scheduled_at = self._normalize_dt(post.scheduled_at)
        if scheduled_at and scheduled_at > now + self.PUBLISH_EARLY_TOLERANCE:
            raise ValueError("Post is not due for publishing yet")
        org = self.db.get(Organization, post.organization_id)
        location = self.db.get(Location, post.location_id)
        self._ensure_not_paused(org=org, location=location)
        cap = self._resolve_cap(org=org, location=location)
        self._enforce_publish_frequency(post=post, now=now, cap=cap)
        self._enforce_publish_min_gap(post=post, now=now)
        self._enforce_content_reuse(
            location_id=post.location_id,
            target_time=now,
            body=post.body,
            fingerprint=post.fingerprint,
            exclude_post_id=post.id,
        )

    def ensure_not_paused(self, *, organization_id: uuid.UUID, location_id: uuid.UUID) -> None:
        org = self.db.get(Organization, organization_id)
        location = self.db.get(Location, location_id)
        self._ensure_not_paused(org=org, location=location)

    def _enforce_post_frequency(self, *, location_id: uuid.UUID, target_time: datetime, cap: int | None) -> None:
        limit = cap if cap is not None else self.MAX_POSTS_PER_WEEK
        window_start = target_time - timedelta(days=7)
        count = (
            self.db.query(Post)
            .filter(Post.location_id == location_id)
            .filter(Post.status.in_(self.ACTIVE_STATUSES))
            .filter(Post.scheduled_at >= window_start)
            .filter(Post.scheduled_at <= target_time)
            .count()
        )
        if count >= limit:
            raise ValueError("Maximum posts per week exceeded for this location")

    def _enforce_min_gap(self, *, location_id: uuid.UUID, target_time: datetime) -> None:
        previous_post = (
            self.db.query(Post)
            .filter(Post.location_id == location_id)
            .filter(Post.status.in_(self.ACTIVE_STATUSES))
            .filter(Post.scheduled_at != None)  # noqa: E711
            .filter(Post.scheduled_at <= target_time)
            .order_by(Post.scheduled_at.desc())
            .first()
        )
        next_post = (
            self.db.query(Post)
            .filter(Post.location_id == location_id)
            .filter(Post.status.in_(self.ACTIVE_STATUSES))
            .filter(Post.scheduled_at != None)  # noqa: E711
            .filter(Post.scheduled_at >= target_time)
            .order_by(Post.scheduled_at.asc())
            .first()
        )
        min_gap = timedelta(hours=self.MIN_GAP_HOURS)
        if previous_post and previous_post.scheduled_at:
            previous_time = self._normalize_dt(previous_post.scheduled_at)
            if target_time - previous_time < min_gap:
                raise ValueError("Minimum gap between posts not satisfied")
        if next_post and next_post.scheduled_at:
            next_time = self._normalize_dt(next_post.scheduled_at)
            if next_time - target_time < min_gap:
                raise ValueError("Minimum gap between posts not satisfied")

    def _enforce_bucket_cooldown(self, *, location_id: uuid.UUID, bucket: str, target_time: datetime) -> None:
        cutoff = target_time - timedelta(days=self.BUCKET_COOLDOWN_DAYS)
        recent = (
            self.db.query(Post)
            .filter(Post.location_id == location_id, Post.bucket == bucket)
            .filter(Post.status.in_(self.ACTIVE_STATUSES))
            .filter(Post.scheduled_at >= cutoff)
            .filter(Post.scheduled_at <= target_time)
            .first()
        )
        if recent:
            raise ValueError("This bucket/topic was used too recently")

    def _enforce_publish_frequency(self, *, post: Post, now: datetime, cap: int | None) -> None:
        limit = cap if cap is not None else self.MAX_POSTS_PER_WEEK
        window_start = now - timedelta(days=7)
        count = (
            self.db.query(Post)
            .filter(Post.location_id == post.location_id)
            .filter(Post.id != post.id)
            .filter(Post.status == PostStatus.PUBLISHED)
            .filter(Post.published_at >= window_start)
            .filter(Post.published_at <= now)
            .count()
        )
        if count >= limit:
            raise ValueError("Maximum published posts per week exceeded for this location")

    def _enforce_publish_min_gap(self, *, post: Post, now: datetime) -> None:
        recent = (
            self.db.query(Post)
            .filter(Post.location_id == post.location_id)
            .filter(Post.id != post.id)
            .filter(Post.status == PostStatus.PUBLISHED)
            .filter(Post.published_at != None)  # noqa: E711
            .filter(Post.published_at <= now)
            .order_by(Post.published_at.desc())
            .first()
        )
        if recent and recent.published_at:
            published_at = self._normalize_dt(recent.published_at)
            if now - published_at < timedelta(hours=self.MIN_GAP_HOURS):
                raise ValueError("Minimum gap between published posts not satisfied")

    def _enforce_content_reuse(
        self,
        *,
        location_id: uuid.UUID,
        target_time: datetime,
        body: str,
        fingerprint: str | None,
        exclude_post_id: uuid.UUID | None = None,
    ) -> None:
        normalized_body = self._normalize_text(body)
        if not normalized_body:
            return
        cutoff = target_time - timedelta(days=self.CONTENT_REUSE_COOLDOWN_DAYS)
        query = (
            self.db.query(Post)
            .filter(Post.location_id == location_id)
            .filter(Post.status.in_(self.ACTIVE_STATUSES))
            .filter(Post.created_at >= cutoff)
        )
        if exclude_post_id:
            query = query.filter(Post.id != exclude_post_id)
        for prior in query.all():
            if fingerprint and prior.fingerprint and prior.fingerprint == fingerprint:
                raise ValueError("Same post content was used too recently")
            prior_body = self._normalize_text(prior.body)
            if not prior_body:
                continue
            if normalized_body == prior_body:
                raise ValueError("Same post content was used too recently")
            if (
                min(len(normalized_body), len(prior_body)) >= 80
                and SequenceMatcher(None, normalized_body, prior_body).ratio() >= self.SIMILARITY_THRESHOLD
            ):
                raise ValueError("Post content is too similar to recent content")

    def _enforce_schedule_window(
        self,
        *,
        location: Location | None,
        target_time: datetime,
        window_id: str | None,
    ) -> None:
        if not window_id:
            return
        window = self.WINDOW_RANGES.get(window_id)
        if not window:
            raise ValueError("Unknown posting window")
        timezone_name = location.timezone if location and location.timezone else "UTC"
        try:
            local_time = target_time.astimezone(ZoneInfo(timezone_name)).time()
        except ZoneInfoNotFoundError:
            local_time = target_time.astimezone(timezone.utc).time()
        start, end = window
        if not (start <= local_time <= end):
            raise ValueError("Scheduled time is outside the selected posting window")

    def _ensure_not_paused(self, *, org: Organization | None, location: Location | None) -> None:
        if settings.GLOBAL_POSTING_PAUSE:
            raise ValueError("Posting is paused globally")
        # Auto-pause if subscription expired
        if org:
            metadata = org.metadata_json or {}
            cancel_at_period_end = metadata.get("cancel_at_period_end")
            current_period_end = metadata.get("current_period_end")
            if cancel_at_period_end and current_period_end:
                now_ts = datetime.now(timezone.utc).timestamp()
                if now_ts > current_period_end:
                    org.posting_paused = True
                    org.is_active = False
                    self.db.add(org)
                    self.db.commit()
        if org and org.posting_paused:
            raise ValueError("Posting is paused for this organization")
        if location and location.posting_paused:
            raise ValueError("Posting is paused for this location")

    @staticmethod
    def _resolve_cap(*, org: Organization | None, location: Location | None) -> int | None:
        if location and location.posting_cap_per_week is not None:
            return location.posting_cap_per_week
        if org and org.posting_cap_per_week is not None:
            return org.posting_cap_per_week
        return None

    @staticmethod
    def _normalize_dt(dt: datetime | None) -> datetime:
        if dt is None:
            return datetime.min.replace(tzinfo=timezone.utc)
        if dt.tzinfo is None or dt.tzinfo.utcoffset(dt) is None:
            return dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)

    @staticmethod
    def _normalize_text(text: str | None) -> str:
        return " ".join(str(text or "").lower().split())

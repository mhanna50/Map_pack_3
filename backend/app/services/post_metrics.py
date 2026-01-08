from __future__ import annotations

from datetime import datetime, timezone, date
from typing import Any

from sqlalchemy.orm import Session

from backend.app.models.post import Post
from backend.app.models.post_metrics_daily import PostMetricsDaily
from backend.app.services.bucket_performance import BucketPerformanceService
from backend.app.services.posting_windows import PostingWindowService


class PostMetricsService:
    """Persists daily metrics per post and feeds other optimizers."""

    def __init__(self, db: Session) -> None:
        self.db = db
        self.windows = PostingWindowService(db)
        self.bucket_performance = BucketPerformanceService(db)

    def record_publish_outcome(self, post: Post, metrics: dict[str, Any] | None = None) -> PostMetricsDaily:
        metrics = metrics or {}
        metric_date = self._metric_date(post)
        views = self._metric_value(metrics, ["views", "impressions", "reach"], fallback=1)
        clicks = self._metric_value(metrics, ["clicks", "actions"], fallback=0)
        actions = self._metric_value(metrics, ["actions", "conversions"], fallback=0)

        record = (
            self.db.query(PostMetricsDaily)
            .filter(
                PostMetricsDaily.organization_id == post.organization_id,
                PostMetricsDaily.location_id == post.location_id,
                PostMetricsDaily.post_id == post.id,
                PostMetricsDaily.metric_date == metric_date,
            )
            .one_or_none()
        )
        if not record:
            record = PostMetricsDaily(
                organization_id=post.organization_id,
                location_id=post.location_id,
                post_id=post.id,
                metric_date=metric_date,
                views=0,
                clicks=0,
                actions=0,
            )
        record.views = (record.views or 0) + views
        record.clicks = (record.clicks or 0) + clicks
        record.actions = (record.actions or 0) + actions
        self.db.add(record)
        self.db.commit()
        self.db.refresh(record)

        if post.window_id:
            self.windows.record_result(
                organization_id=post.organization_id,
                location_id=post.location_id,
                window_id=post.window_id,
                impressions=views,
                clicks=clicks,
                conversions=actions,
            )

        reward = self._reward(clicks=clicks, actions=actions, views=views)
        topic_tag = (post.topic_tags or [None])[0]
        self.bucket_performance.record_outcome(
            organization_id=post.organization_id,
            location_id=post.location_id,
            bucket=post.bucket,
            topic_tag=topic_tag,
            reward=reward,
        )
        return record

    @staticmethod
    def _metric_date(post: Post) -> date:
        published = post.published_at or datetime.now(timezone.utc)
        return published.date()

    @staticmethod
    def _metric_value(metric_source: dict[str, Any], keys: list[str], fallback: int) -> int:
        for key in keys:
            value = metric_source.get(key)
            if isinstance(value, (int, float)):
                return int(value)
        return fallback

    @staticmethod
    def _reward(*, clicks: int, actions: int, views: int) -> float:
        if actions:
            return float(actions) * 1.5
        if clicks:
            return float(clicks)
        return max(1.0, views * 0.1)

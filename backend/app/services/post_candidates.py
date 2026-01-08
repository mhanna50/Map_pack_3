from __future__ import annotations

from datetime import datetime, timedelta, timezone, date
from typing import Any
import uuid

from sqlalchemy.orm import Session

from backend.app.models.alert import AlertSeverity
from backend.app.models.enums import PostStatus
from backend.app.models.post import Post
from backend.app.models.location import Location
from backend.app.models.post_candidate import PostCandidate
from backend.app.models.daily_signal import DailySignal
from backend.app.services.alerts import AlertService
from backend.app.services.bucket_performance import BucketPerformanceService
from backend.app.services.daily_signals import DailySignalService
from backend.app.services.seasonal import SeasonalPlanner


BUCKETS: list[dict[str, Any]] = [
    {"id": "service_spotlight", "cooldown_days": 14},
    {"id": "proof", "cooldown_days": 14},
    {"id": "seasonal_tip", "cooldown_days": 10},
    {"id": "faq", "cooldown_days": 10},
    {"id": "offer", "cooldown_days": 30},
    {"id": "local_highlight", "cooldown_days": 21},
]


class PostCandidateService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.alerts = AlertService(db)
        self.daily_signals = DailySignalService(db)
        self.bucket_perf = BucketPerformanceService(db)
        self.seasonal = SeasonalPlanner()

    def generate(
        self,
        *,
        organization_id: uuid.UUID,
        location_id: uuid.UUID,
        target_date: date | None = None,
        threshold: float = 25,
    ) -> PostCandidate | None:
        target_date = target_date or datetime.now(timezone.utc).date()
        signal = self._latest_signal(organization_id, location_id, target_date)
        if not signal:
            signal = self.daily_signals.compute(
                organization_id=organization_id,
                location_id=location_id,
                target_date=target_date,
            )
        location = self.db.get(Location, location_id)
        if not location:
            raise ValueError("Location not found")
        best: tuple[dict[str, Any], float] | None = None
        as_of = datetime.combine(target_date, datetime.min.time(), tzinfo=timezone.utc)
        reasons: dict[str, Any] = {
            "days_since_post": signal.days_since_post,
            "reviews_last_7d": signal.review_count_7d,
            "rank_delta_7d": signal.rank_delta_7d,
            "new_media_count": (signal.extra_metrics or {}).get("new_media_14d"),
            "posts_last_7d": (signal.extra_metrics or {}).get("posts_last_7d"),
        }
        seasonal_bucket = self.seasonal.pick_bucket(
            month=target_date.month,
            category=self._location_category(location),
        )
        event_trigger = self.seasonal.event_trigger(
            target_date=target_date,
            timezone_name=location.timezone,
            weather_alert=(signal.extra_metrics or {}).get("weather_alert"),
        )
        if seasonal_bucket:
            reasons["seasonal_bucket"] = seasonal_bucket
        if event_trigger:
            reasons["event_trigger"] = event_trigger
        connection_ok = (signal.extra_metrics or {}).get("gbp_connection_ok", True)
        if not connection_ok:
            self.alerts.create_alert(
                severity=AlertSeverity.WARNING,
                alert_type="gbp_disconnected",
                message="GBP connection lost",
                organization_id=organization_id,
                location_id=location_id,
            )
            return None
        for bucket in BUCKETS:
            score = self._score_bucket(bucket, signal, location_id, target_date, as_of=as_of)
            if seasonal_bucket and bucket["id"] == seasonal_bucket:
                score += 10
            if event_trigger and bucket["id"] == event_trigger.get("bucket"):
                score += event_trigger.get("boost", 12)
            perf_score = self.bucket_perf.get_score(
                organization_id=organization_id,
                location_id=location_id,
                bucket=bucket["id"],
                topic_tag=None,
                as_of=as_of,
            )
            reasons[f"bucket_{bucket['id']}_score"] = perf_score
            score += min(20, perf_score)
            if score <= 0:
                continue
            if not best or score > best[1]:
                best = (bucket, score)
        if not best or best[1] < threshold:
            return None
        selected_bucket = best[0]["id"]
        selected_bucket = best[0]["id"]
        performance_score = self.bucket_perf.get_score(
            organization_id=organization_id,
            location_id=location_id,
            bucket=selected_bucket,
            topic_tag=None,
            as_of=as_of,
        )
        reasons["selected_bucket"] = selected_bucket
        reasons["bucket_performance_score"] = performance_score
        candidate = PostCandidate(
            organization_id=organization_id,
            location_id=location_id,
            candidate_date=target_date,
            bucket=selected_bucket,
            score=best[1],
            reason_json={**reasons, "selected_bucket": selected_bucket, "score": best[1]},
            status=PostStatus.DRAFT,
        )
        self.db.add(candidate)
        self.db.commit()
        self.db.refresh(candidate)
        return candidate

    def _latest_signal(self, organization_id: uuid.UUID, location_id: uuid.UUID, target_date: date) -> DailySignal | None:
        return (
            self.db.query(DailySignal)
            .filter(
                DailySignal.organization_id == organization_id,
                DailySignal.location_id == location_id,
                DailySignal.signal_date <= target_date,
            )
            .order_by(DailySignal.signal_date.desc())
            .first()
        )

    def _score_bucket(
        self,
        bucket: dict[str, Any],
        signal: DailySignal,
        location_id: uuid.UUID,
        target_date: date,
        *,
        as_of: datetime,
    ) -> float:
        extra = signal.extra_metrics or {}
        if extra.get("posts_last_7d", 0) >= 3:
            return 0
        base = 0.0
        if signal.days_since_post is not None:
            base += min(40, signal.days_since_post * 6)
        if signal.review_count_7d:
            base += min(15, signal.review_count_7d * 2)
        if signal.rank_delta_7d is not None and signal.rank_delta_7d < 0:
            base += min(20, abs(signal.rank_delta_7d) * 4)
        if extra.get("new_media_14d"):
            base += 10
        base += self._coverage_gap_bonus(bucket["id"], location_id, target_date)
        if not self._bucket_cooldown_ok(bucket["id"], location_id, target_date, bucket["cooldown_days"]):
            base -= 50
        return base

    def _bucket_cooldown_ok(self, bucket_id: str, location_id: uuid.UUID, target_date: date, cooldown_days: int) -> bool:
        cutoff = datetime.combine(target_date - timedelta(days=cooldown_days), datetime.min.time(), tzinfo=timezone.utc)
        recent = (
            self.db.query(Post)
            .filter(Post.location_id == location_id)
            .filter(Post.bucket == bucket_id)
            .filter(Post.published_at >= cutoff)
            .first()
        )
        return recent is None

    def _coverage_gap_bonus(self, bucket_id: str, location_id: uuid.UUID, target_date: date) -> float:
        cutoff = datetime.combine(target_date - timedelta(days=30), datetime.min.time(), tzinfo=timezone.utc)
        used = (
            self.db.query(Post)
            .filter(Post.location_id == location_id)
            .filter(Post.bucket == bucket_id)
            .filter(Post.published_at >= cutoff)
            .count()
        )
        return 10.0 if used == 0 else 0.0

    @staticmethod
    def _location_category(location: Location) -> str | None:
        address = location.address or {}
        category = address.get("category") or address.get("primaryCategory")
        return category.lower() if isinstance(category, str) else None

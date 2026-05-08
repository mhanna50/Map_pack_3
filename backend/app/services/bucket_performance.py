from __future__ import annotations

from datetime import datetime, timedelta, timezone
import uuid

from sqlalchemy.orm import Session

from backend.app.models.bucket_performance import BucketPerformance, DEFAULT_TOPIC_KEY


class BucketPerformanceService:
    DECAY_DAYS = 45

    def __init__(self, db: Session) -> None:
        self.db = db

    def get_score(
        self,
        *,
        organization_id: uuid.UUID,
        location_id: uuid.UUID,
        bucket: str,
        topic_tag: str | None = None,
        as_of: datetime,
    ) -> float:
        record = (
            self.db.query(BucketPerformance)
            .filter(
                BucketPerformance.organization_id == organization_id,
                BucketPerformance.location_id == location_id,
                BucketPerformance.bucket == bucket,
                BucketPerformance.topic_tag == self._topic_key(topic_tag),
            )
            .one_or_none()
        )
        if not record or record.score <= 0:
            return 0.0
        if not record.last_engaged_at:
            return record.score
        elapsed = (as_of - record.last_engaged_at).days
        decay = max(0.0, 1.0 - elapsed / self.DECAY_DAYS)
        return max(0.0, record.score * decay)

    def record_outcome(
        self,
        *,
        organization_id: uuid.UUID,
        location_id: uuid.UUID,
        bucket: str | None,
        topic_tag: str | None = None,
        reward: float,
    ) -> BucketPerformance | None:
        if not bucket:
            return None
        record = (
            self.db.query(BucketPerformance)
            .filter(
                BucketPerformance.organization_id == organization_id,
                BucketPerformance.location_id == location_id,
                BucketPerformance.bucket == bucket,
                BucketPerformance.topic_tag == self._topic_key(topic_tag),
            )
            .one_or_none()
        )
        if not record:
            record = BucketPerformance(
                organization_id=organization_id,
                location_id=location_id,
                bucket=bucket,
                topic_tag=self._topic_key(topic_tag),
                score=0.0,
            )
        record.score = max(0.0, record.score * 0.8 + reward)
        record.last_engaged_at = datetime.now(timezone.utc)
        self.db.add(record)
        self.db.commit()
        self.db.refresh(record)
        return record

    @staticmethod
    def _topic_key(topic_tag: str | None) -> str:
        return (topic_tag or DEFAULT_TOPIC_KEY).lower()

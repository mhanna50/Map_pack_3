from __future__ import annotations

from datetime import datetime, timedelta, timezone, date
import uuid
from statistics import mean, pstdev

from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.app.models.daily_signal import DailySignal
from backend.app.models.location import Location
from backend.app.models.media_asset import MediaAsset
from backend.app.models.post import Post
from backend.app.models.review import Review
from backend.app.models.rank_snapshot import RankSnapshot
from backend.app.models.gbp_connection import GbpConnection


class DailySignalService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def compute(
        self,
        *,
        organization_id: uuid.UUID,
        location_id: uuid.UUID,
        target_date: date | None = None,
    ) -> DailySignal:
        target_date = target_date or datetime.now(timezone.utc).date()
        location = self.db.get(Location, location_id)
        if not location:
            raise ValueError("Location not found")
        snapshot = (
            self.db.query(DailySignal)
            .filter(
                DailySignal.organization_id == organization_id,
                DailySignal.location_id == location_id,
                DailySignal.signal_date == target_date,
            )
            .one_or_none()
        )
        if not snapshot:
            snapshot = DailySignal(
                organization_id=organization_id,
                location_id=location_id,
                signal_date=target_date,
            )
        now = datetime.now(timezone.utc)
        snapshot.days_since_post = self._days_since_last_post(location_id, now)
        snapshot.review_count_7d = self._review_count(location_id, now, days=7)
        snapshot.avg_rating_30d = self._avg_rating(location_id, now, days=30)
        snapshot.rank_delta_7d = self._rank_delta(location_id, target_date, days=7)
        snapshot.extra_metrics = {
            "posts_last_7d": self._post_count(location_id, now, days=7),
            "rank_volatility_30d": self._rank_volatility(location_id, target_date, days=30),
            "new_media_14d": self._new_media(location_id, now, days=14),
            "gbp_connection_ok": self._connection_ok(organization_id),
        }
        self.db.add(snapshot)
        self.db.commit()
        self.db.refresh(snapshot)
        return snapshot

    def _days_since_last_post(self, location_id: uuid.UUID, now: datetime) -> int | None:
        last_post = (
            self.db.query(Post)
            .filter(Post.location_id == location_id)
            .filter(Post.published_at != None)  # noqa: E711
            .order_by(Post.published_at.desc())
            .first()
        )
        if not last_post or not last_post.published_at:
            return None
        return (now - last_post.published_at).days

    def _post_count(self, location_id: uuid.UUID, now: datetime, days: int) -> int:
        window_start = now - timedelta(days=days)
        return (
            self.db.query(Post)
            .filter(Post.location_id == location_id)
            .filter(Post.published_at >= window_start)
            .count()
        )

    def _review_count(self, location_id: uuid.UUID, now: datetime, days: int) -> int:
        window_start = now - timedelta(days=days)
        return (
            self.db.query(Review)
            .filter(Review.location_id == location_id)
            .filter(Review.created_at >= window_start)
            .count()
        )

    def _avg_rating(self, location_id: uuid.UUID, now: datetime, days: int) -> float | None:
        window_start = now - timedelta(days=days)
        ratings = [
            float(review.rating.value)
            for review in self.db.query(Review)
            .filter(Review.location_id == location_id)
            .filter(Review.created_at >= window_start)
            .all()
        ]
        return mean(ratings) if ratings else None

    def _rank_delta(self, location_id: uuid.UUID, target_date: date, days: int) -> float | None:
        recent = (
            self.db.query(RankSnapshot)
            .filter(RankSnapshot.location_id == location_id)
            .filter(RankSnapshot.checked_at >= target_date - timedelta(days=days))
            .order_by(RankSnapshot.checked_at.asc())
            .all()
        )
        if len(recent) < 2:
            return None
        return (recent[-1].rank or 0) - (recent[0].rank or 0)

    def _rank_volatility(self, location_id: uuid.UUID, target_date: date, days: int) -> float | None:
        recent = [
            snapshot.rank or 0
            for snapshot in self.db.query(RankSnapshot)
            .filter(RankSnapshot.location_id == location_id)
            .filter(RankSnapshot.checked_at >= target_date - timedelta(days=days))
            .all()
        ]
        if len(recent) < 2:
            return None
        return pstdev(recent)

    def _new_media(self, location_id: uuid.UUID, now: datetime, days: int) -> int:
        window_start = now - timedelta(days=days)
        return (
            self.db.query(MediaAsset)
            .filter(MediaAsset.location_id == location_id)
            .filter(MediaAsset.created_at >= window_start)
            .count()
        )

    def _connection_ok(self, organization_id: uuid.UUID) -> bool:
        connection = self.db.query(GbpConnection).filter(GbpConnection.organization_id == organization_id).one_or_none()
        if not connection:
            return False
        if not connection.access_token_expires_at:
            return True
        return connection.access_token_expires_at > datetime.now(timezone.utc)

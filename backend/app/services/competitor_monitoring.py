from __future__ import annotations

from datetime import datetime, timedelta, timezone
import uuid
from typing import Any, Sequence, TYPE_CHECKING

from fastapi import HTTPException
from sqlalchemy.orm import Session

from backend.app.models.competitor_profile import CompetitorProfile
from backend.app.models.competitor_snapshot import CompetitorSnapshot
from backend.app.models.connected_account import ConnectedAccount
from backend.app.models.enums import ActionType, CompetitorSource, PostType
from backend.app.models.location import Location
from backend.app.models.location_settings import LocationSettings
from backend.app.models.media_asset import MediaAsset
from backend.app.models.post import Post
from backend.app.models.review import Review
from backend.app.services.connected_accounts import ConnectedAccountService
from backend.app.services.google import GoogleBusinessClient, GoogleOAuthService
from backend.app.services.validators import assert_location_in_org

if TYPE_CHECKING:
    from backend.app.services.actions import ActionService


class CompetitorMonitoringService:
    def __init__(self, db: Session, action_service: "ActionService" | None = None) -> None:
        self.db = db
        if action_service is None:
            from backend.app.services.actions import ActionService as ActionServiceImpl

            self.action_service = ActionServiceImpl(db)
        else:
            self.action_service = action_service
        self.metrics_fetcher = CompetitorMetricsFetcher(db)

    def list_competitors(self, *, location_id: uuid.UUID) -> list[CompetitorProfile]:
        return (
            self.db.query(CompetitorProfile)
            .filter(CompetitorProfile.location_id == location_id)
            .filter(CompetitorProfile.is_active.is_(True))
            .order_by(CompetitorProfile.name.asc())
            .all()
        )

    def list_snapshots(
        self, *, location_id: uuid.UUID, competitor_id: uuid.UUID | None = None
    ) -> list[CompetitorSnapshot]:
        query = (
            self.db.query(CompetitorSnapshot)
            .filter(CompetitorSnapshot.location_id == location_id)
            .order_by(CompetitorSnapshot.captured_at.desc())
        )
        if competitor_id:
            query = query.filter(CompetitorSnapshot.competitor_id == competitor_id)
        return list(query.all())

    def upsert_manual_competitors(
        self,
        *,
        organization_id: uuid.UUID,
        location_id: uuid.UUID,
        competitors: Sequence[dict],
    ) -> list[CompetitorProfile]:
        assert_location_in_org(self.db, location_id=location_id, organization_id=organization_id)
        existing = (
            self.db.query(CompetitorProfile)
            .filter(CompetitorProfile.location_id == location_id)
            .filter(CompetitorProfile.source == CompetitorSource.MANUAL)
            .all()
        )
        lookup: dict[str, CompetitorProfile] = {}
        for profile in existing:
            key = (profile.google_location_id or profile.name).lower()
            lookup[key] = profile
        upserted: list[CompetitorProfile] = []
        for entry in competitors:
            name = entry.get("name", "").strip()
            if not name:
                continue
            google_location_id = entry.get("google_location_id")
            key = (google_location_id or name).lower()
            profile = lookup.get(key)
            if not profile:
                profile = CompetitorProfile(
                    organization_id=organization_id,
                    location_id=location_id,
                    name=name,
                    google_location_id=google_location_id,
                    category=entry.get("category"),
                    metadata_json=entry.get("metadata") or {},
                    source=CompetitorSource.MANUAL,
                )
                self.db.add(profile)
                lookup[key] = profile
                existing.append(profile)
            else:
                profile.category = entry.get("category") or profile.category
                metadata = profile.metadata_json or {}
                metadata.update(entry.get("metadata") or {})
                profile.metadata_json = metadata
            upserted.append(profile)
        self.db.commit()
        for profile in upserted:
            self.db.refresh(profile)
        return sorted(existing, key=lambda item: item.name.lower())

    def auto_discover_competitors(
        self,
        *,
        organization_id: uuid.UUID,
        location_id: uuid.UUID,
        top_n: int = 5,
    ) -> list[CompetitorProfile]:
        assert_location_in_org(self.db, location_id=location_id, organization_id=organization_id)
        location = self.db.get(Location, location_id)
        if not location:
            return []
        auto_profiles = (
            self.db.query(CompetitorProfile)
            .filter(CompetitorProfile.location_id == location_id)
            .filter(CompetitorProfile.source == CompetitorSource.AUTO)
            .all()
        )
        while len(auto_profiles) < top_n:
            index = len(auto_profiles) + 1
            name = self._auto_name(location.name, index)
            profile = CompetitorProfile(
                organization_id=organization_id,
                location_id=location_id,
                name=name,
                google_location_id=f"auto-{location_id}-{index}",
                category=location.settings.services[0] if location.settings and location.settings.services else None,
                metadata_json={"rank_hint": index},
                source=CompetitorSource.AUTO,
            )
            self.db.add(profile)
            auto_profiles.append(profile)
        self.db.commit()
        for profile in auto_profiles:
            self.db.refresh(profile)
        return sorted(auto_profiles, key=lambda item: item.name.lower())

    def schedule_monitoring(self, *, organization_id: uuid.UUID, location_id: uuid.UUID):
        assert_location_in_org(self.db, location_id=location_id, organization_id=organization_id)
        run_at = datetime.now(timezone.utc)
        return self.action_service.schedule_action(
            organization_id=organization_id,
            action_type=ActionType.MONITOR_COMPETITORS,
            run_at=run_at,
            payload={"location_id": str(location_id)},
            location_id=location_id,
        )

    def run_monitoring(
        self,
        *,
        organization_id: uuid.UUID,
        location_id: uuid.UUID,
    ) -> dict[str, int | str]:
        location = self.db.get(Location, location_id)
        if not location:
            return {"status": "missing_location"}
        competitors = self.list_competitors(location_id=location_id)
        if not competitors:
            competitors = self.auto_discover_competitors(
                organization_id=organization_id,
                location_id=location_id,
                top_n=3,
            )
        now = datetime.now(timezone.utc)
        snapshots = []
        for competitor in competitors:
            metrics = self._generate_metrics(competitor)
            gap_flags = self._compute_gap_flags(location_id=location_id, metrics=metrics)
            snapshot = CompetitorSnapshot(
                organization_id=competitor.organization_id,
                location_id=competitor.location_id,
                competitor_id=competitor.id,
                captured_at=now,
                review_count=metrics["review_count"],
                average_rating=metrics["average_rating"],
                review_velocity_per_week=metrics["review_velocity"],
                posting_frequency_per_week=metrics["posting_frequency"],
                photo_count=metrics["photo_count"],
                gap_flags=gap_flags,
                notes="Automated monitoring snapshot",
                metadata_json={"shares_offers": metrics["shares_offers"]},
            )
            competitor.last_monitored_at = now
            self.db.add(snapshot)
            snapshots.append(snapshot)
        self.db.commit()
        return {"status": "competitors_monitored", "snapshots": len(snapshots)}

    def _auto_name(self, location_name: str, index: int) -> str:
        base = location_name or "Local"
        return f"{base} Rival {index}"

    def _generate_metrics(self, competitor: CompetitorProfile) -> dict[str, float | int | bool]:
        metrics = self.metrics_fetcher.fetch_metrics(competitor)
        if metrics:
            return metrics
        seed = self._metric_seed(competitor.name)
        review_count = 40 + seed % 60
        average_rating = round(3.8 + (seed % 12) * 0.05, 2)
        review_velocity = 1 + (seed % 3)
        posting_frequency = 1 + (seed % 3) * 0.5
        photo_count = 15 + seed % 40
        shares_offers = seed % 2 == 0
        return {
            "review_count": review_count,
            "average_rating": average_rating,
            "review_velocity": review_velocity,
            "posting_frequency": posting_frequency,
            "photo_count": photo_count,
            "shares_offers": shares_offers,
        }

    def _metric_seed(self, name: str) -> int:
        return sum(ord(ch) for ch in name)

    def _compute_gap_flags(self, *, location_id: uuid.UUID, metrics: dict) -> list[str]:
        gaps: list[str] = []
        post_freq = self._get_post_frequency(location_id)
        review_velocity = self._get_review_velocity(location_id)
        photo_count = self._get_photo_count(location_id)
        offers_published = self._location_has_offer_post(location_id)

        if metrics["posting_frequency"] > post_freq:
            gaps.append("They publish GBP posts more frequently.")
        if metrics["review_velocity"] > review_velocity:
            gaps.append("They earn reviews faster each week.")
        if metrics["photo_count"] > photo_count + 5:
            gaps.append("They upload more photos to stay fresh.")
        if metrics["shares_offers"] and not offers_published:
            gaps.append("They promote offers but you don’t.")
        return gaps

    def _get_post_frequency(self, location_id: uuid.UUID) -> float:
        settings = (
            self.db.query(LocationSettings)
            .filter(LocationSettings.location_id == location_id)
            .first()
        )
        if settings and settings.posting_schedule:
            days = settings.posting_schedule.get("days") if isinstance(settings.posting_schedule, dict) else None
            if days:
                return max(len(days), 1)
        scheduled_posts = (
            self.db.query(Post)
            .filter(Post.location_id == location_id)
            .count()
        )
        return float(max(scheduled_posts, 1))

    def _get_review_velocity(self, location_id: uuid.UUID) -> float:
        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(days=30)
        count = (
            self.db.query(Review)
            .filter(Review.location_id == location_id)
            .filter(Review.created_at >= cutoff)
            .count()
        )
        return max(count / 4, 0.25)

    def _get_photo_count(self, location_id: uuid.UUID) -> int:
        return (
            self.db.query(MediaAsset)
            .filter(MediaAsset.location_id == location_id)
            .count()
        )

    def _location_has_offer_post(self, location_id: uuid.UUID) -> bool:
        return (
            self.db.query(Post)
            .filter(Post.location_id == location_id)
            .filter(Post.post_type == PostType.OFFER)
            .first()
            is not None
        )


class CompetitorMetricsFetcher:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.account_service = ConnectedAccountService(db)
        self.oauth = GoogleOAuthService()

    def fetch_metrics(self, competitor: CompetitorProfile) -> dict[str, float | int | bool] | None:
        metadata = competitor.metadata_json or {}
        manual_metrics = metadata.get("metrics")
        if manual_metrics:
            return self._normalize_manual_metrics(manual_metrics)
        google_metrics = self._fetch_from_google(competitor)
        if google_metrics:
            return google_metrics
        return None

    def _normalize_manual_metrics(self, metrics: dict) -> dict[str, float | int | bool]:
        return {
            "review_count": int(metrics.get("review_count", 0)),
            "average_rating": float(metrics.get("average_rating", 0.0)),
            "review_velocity": float(metrics.get("review_velocity_per_week", 0.0)),
            "posting_frequency": float(metrics.get("posting_frequency_per_week", 0.0)),
            "photo_count": int(metrics.get("photo_count", 0)),
            "shares_offers": bool(metrics.get("shares_offers", False)),
        }

    def _fetch_from_google(self, competitor: CompetitorProfile) -> dict[str, float | int | bool] | None:
        location = self.db.get(Location, competitor.location_id)
        if not location or not location.connected_account_id or not competitor.google_location_id:
            return None
        account: ConnectedAccount | None = self.db.get(
            ConnectedAccount, location.connected_account_id
        )
        if not account:
            return None

        def refresh(refresh_token: str) -> dict[str, Any]:
            return self.oauth.refresh_access_token(refresh_token)

        try:
            access_token = self.account_service.ensure_access_token(
                account, refresh_callback=refresh
            )
        except Exception:
            return None

        client = GoogleBusinessClient(access_token)
        try:
            reviews = client.list_reviews(competitor.google_location_id) or []
            posts = client.list_local_posts(competitor.google_location_id) or []
            media = client.list_media(competitor.google_location_id) or []
        except HTTPException:
            return None
        except Exception:
            return None

        review_count = len(reviews)
        average_rating = self._average_rating(reviews)
        review_velocity = self._review_velocity(reviews)
        posting_frequency = self._posting_frequency(posts)
        photo_count = len(media)
        shares_offers = any(
            (post.get("topicType") or "").upper() == "OFFER" for post in posts
        )
        return {
            "review_count": review_count,
            "average_rating": average_rating,
            "review_velocity": review_velocity,
            "posting_frequency": posting_frequency,
            "photo_count": photo_count,
            "shares_offers": shares_offers,
        }

    def _average_rating(self, reviews: list[dict[str, Any]]) -> float:
        ratings = [self._rating_value(review.get("starRating")) for review in reviews if review.get("starRating")]
        if not ratings:
            return 0.0
        return round(sum(ratings) / len(ratings), 2)

    def _review_velocity(self, reviews: list[dict[str, Any]]) -> float:
        cutoff = datetime.now(timezone.utc) - timedelta(days=28)
        recent = [
            review
            for review in reviews
            if self._parse_google_time(review.get("updateTime") or review.get("createTime")) >= cutoff
        ]
        if not recent:
            return 0.0
        return round(len(recent) / 4, 2)

    def _posting_frequency(self, posts: list[dict[str, Any]]) -> float:
        cutoff = datetime.now(timezone.utc) - timedelta(days=28)
        recent = [
            post
            for post in posts
            if self._parse_google_time(post.get("updateTime") or post.get("createTime")) >= cutoff
        ]
        if not recent:
            return 0.0
        return round(len(recent) / 4, 2)

    def _rating_value(self, rating: Any) -> float:
        try:
            return float(rating)
        except (TypeError, ValueError):
            return 0.0

    def _parse_google_time(self, value: Any) -> datetime:
        if not value:
            return datetime.min.replace(tzinfo=timezone.utc)
        text = str(value)
        if text.endswith("Z"):
            text = text.replace("Z", "+00:00")
        try:
            return datetime.fromisoformat(text)
        except ValueError:
            return datetime.min.replace(tzinfo=timezone.utc)

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Protocol
import uuid

from sqlalchemy.orm import Session

from backend.app.models.enums import ReviewProvider, ReviewRating
from backend.app.models.google_business.location import Location
from backend.app.models.reviews.review import Review
from backend.app.services.google_business.gbp_sync import GbpSyncService
from backend.app.services.google_business.gbp_publishing import GbpPublishingService


TOP_REVIEW_PROVIDERS: tuple[ReviewProvider, ...] = (
    ReviewProvider.GOOGLE,
    ReviewProvider.YELP,
    ReviewProvider.FACEBOOK,
    ReviewProvider.TRIPADVISOR,
    ReviewProvider.TRUSTPILOT,
    ReviewProvider.BBB,
    ReviewProvider.ANGI,
    ReviewProvider.NEXTDOOR,
    ReviewProvider.HEALTHGRADES,
    ReviewProvider.OPENTABLE,
)


PROVIDER_REQUIREMENTS: dict[ReviewProvider, dict[str, Any]] = {
    ReviewProvider.GOOGLE: {
        "display_name": "Google Business Profile",
        "supports_sync": True,
        "supports_reply": True,
        "requirements": ["Google OAuth client", "Business Profile API access", "client GBP manager permissions"],
    },
    ReviewProvider.YELP: {
        "display_name": "Yelp",
        "supports_sync": False,
        "supports_reply": False,
        "requirements": ["Yelp Fusion/Data Licensing access", "per-location Yelp business ID"],
        "notes": "Official public access is limited; full review/reply workflows typically require partner/data licensing.",
    },
    ReviewProvider.FACEBOOK: {
        "display_name": "Facebook Recommendations",
        "supports_sync": False,
        "supports_reply": False,
        "requirements": ["Meta app review", "Pages permissions", "per-location Facebook Page ID"],
    },
    ReviewProvider.TRIPADVISOR: {
        "display_name": "Tripadvisor",
        "supports_sync": False,
        "supports_reply": False,
        "requirements": ["Tripadvisor content/API partner access", "per-location Tripadvisor location ID"],
    },
    ReviewProvider.TRUSTPILOT: {
        "display_name": "Trustpilot",
        "supports_sync": False,
        "supports_reply": False,
        "requirements": ["Trustpilot business API credentials", "business unit ID"],
    },
    ReviewProvider.BBB: {
        "display_name": "Better Business Bureau",
        "supports_sync": False,
        "supports_reply": False,
        "requirements": ["BBB profile URL or partner data feed", "business profile mapping"],
    },
    ReviewProvider.ANGI: {
        "display_name": "Angi",
        "supports_sync": False,
        "supports_reply": False,
        "requirements": ["Angi business/partner access", "profile mapping"],
    },
    ReviewProvider.NEXTDOOR: {
        "display_name": "Nextdoor",
        "supports_sync": False,
        "supports_reply": False,
        "requirements": ["Nextdoor business profile access", "partner/API approval if available"],
    },
    ReviewProvider.HEALTHGRADES: {
        "display_name": "Healthgrades",
        "supports_sync": False,
        "supports_reply": False,
        "requirements": ["Healthgrades profile URL or partner feed", "provider/practice mapping"],
    },
    ReviewProvider.OPENTABLE: {
        "display_name": "OpenTable",
        "supports_sync": False,
        "supports_reply": False,
        "requirements": ["OpenTable restaurant profile/partner access", "restaurant ID"],
    },
}


@dataclass(frozen=True)
class ProviderSyncResult:
    provider: ReviewProvider
    status: str
    count: int = 0
    message: str | None = None


class ReviewProviderAdapter(Protocol):
    provider: ReviewProvider

    def sync_reviews(self, *, organization_id: uuid.UUID, location_id: uuid.UUID) -> ProviderSyncResult:
        ...

    def reply_to_review(self, review: Review, reply_body: str) -> dict[str, Any]:
        ...


class GoogleReviewProvider:
    provider = ReviewProvider.GOOGLE

    def __init__(self, db: Session) -> None:
        self.db = db
        self.sync = GbpSyncService(db)
        self.publisher = GbpPublishingService(db)

    def sync_reviews(self, *, organization_id: uuid.UUID, location_id: uuid.UUID) -> ProviderSyncResult:
        count = self.sync.sync_reviews(organization_id, location_id)
        return ProviderSyncResult(provider=self.provider, status="synced", count=count)

    def reply_to_review(self, review: Review, reply_body: str) -> dict[str, Any]:
        return self.publisher.reply_to_review(review, reply_body)


class ManualProvider:
    def __init__(self, db: Session, provider: ReviewProvider) -> None:
        self.db = db
        self.provider = provider

    def sync_reviews(self, *, organization_id: uuid.UUID, location_id: uuid.UUID) -> ProviderSyncResult:
        requirement = PROVIDER_REQUIREMENTS[self.provider]
        return ProviderSyncResult(
            provider=self.provider,
            status="not_configured",
            count=0,
            message=f"{requirement['display_name']} needs approved API/partner access before automated sync can run.",
        )

    def reply_to_review(self, review: Review, reply_body: str) -> dict[str, Any]:
        raise ValueError(f"{self.provider.value} replies are not automated yet")


class ReviewProviderRegistry:
    def __init__(self, db: Session) -> None:
        self.db = db

    def adapter(self, provider: ReviewProvider) -> ReviewProviderAdapter:
        if provider == ReviewProvider.GOOGLE:
            return GoogleReviewProvider(self.db)
        return ManualProvider(self.db, provider)

    def status(self, *, organization_id: uuid.UUID, location_id: uuid.UUID | None = None) -> list[dict[str, Any]]:
        mapped_counts = self._mapped_counts(organization_id=organization_id, location_id=location_id)
        return [
            {
                "provider": provider.value,
                **PROVIDER_REQUIREMENTS[provider],
                "configured": self._is_configured(
                    provider=provider,
                    organization_id=organization_id,
                    location_id=location_id,
                ),
                "mapped_reviews": mapped_counts.get(provider, 0),
            }
            for provider in TOP_REVIEW_PROVIDERS
        ]

    def sync_all(self, *, organization_id: uuid.UUID, location_id: uuid.UUID) -> list[ProviderSyncResult]:
        return [
            self.adapter(provider).sync_reviews(
                organization_id=organization_id,
                location_id=location_id,
            )
            for provider in TOP_REVIEW_PROVIDERS
        ]

    def _mapped_counts(
        self, *, organization_id: uuid.UUID, location_id: uuid.UUID | None = None
    ) -> dict[ReviewProvider, int]:
        query = self.db.query(Review).filter(Review.organization_id == organization_id)
        if location_id:
            query = query.filter(Review.location_id == location_id)
        counts: dict[ReviewProvider, int] = {}
        for review in query.all():
            provider = review.provider or ReviewProvider.GOOGLE
            counts[provider] = counts.get(provider, 0) + 1
        return counts

    def _is_configured(
        self, *, provider: ReviewProvider, organization_id: uuid.UUID, location_id: uuid.UUID | None = None
    ) -> bool:
        if provider != ReviewProvider.GOOGLE:
            return False

        query = self.db.query(Location).filter(
            Location.organization_id == organization_id,
            Location.google_location_id != None,  # noqa: E711
        )
        if location_id:
            query = query.filter(Location.id == location_id)
        return self.db.query(query.exists()).scalar() is True


def normalize_google_rating(raw: Any) -> ReviewRating:
    if isinstance(raw, str) and raw in ReviewRating.__members__:
        return ReviewRating[raw]
    value = str(raw or "").strip()
    return {
        "1": ReviewRating.ONE,
        "2": ReviewRating.TWO,
        "3": ReviewRating.THREE,
        "4": ReviewRating.FOUR,
        "5": ReviewRating.FIVE,
    }.get(value, ReviewRating.THREE)

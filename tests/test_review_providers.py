from __future__ import annotations

from backend.app.models.enums import OrganizationType, ReviewProvider
from backend.app.models.google_business.location import Location
from backend.app.models.identity.organization import Organization
from backend.app.features.reviews.providers import ReviewProviderRegistry
from backend.app.services.google_business.gbp_sync import GbpSyncService


class _FakeGoogleClient:
    def list_reviews(self, location_name: str):
        return [
            {
                "name": f"{location_name}/reviews/google-1",
                "comment": "Excellent service",
                "starRating": "FIVE",
                "reviewer": {"displayName": "Jamie"},
            }
        ]


def test_review_provider_registry_lists_top_ten(db_session):
    org = Organization(name="Review Org", org_type=OrganizationType.BUSINESS)
    db_session.add(org)
    db_session.commit()

    providers = ReviewProviderRegistry(db_session).status(organization_id=org.id)

    assert [row["provider"] for row in providers] == [provider.value for provider in ReviewProvider]
    assert len(providers) == 10
    google = next(row for row in providers if row["provider"] == "google")
    assert google["supports_sync"] is True
    assert google["supports_reply"] is True
    assert google["configured"] is False


def test_google_review_sync_tags_reviews_with_provider(db_session, monkeypatch):
    org = Organization(name="Google Reviews Org", org_type=OrganizationType.BUSINESS)
    db_session.add(org)
    db_session.flush()
    location = Location(
        name="Main",
        organization_id=org.id,
        timezone="UTC",
        google_location_id="accounts/1/locations/2",
    )
    db_session.add(location)
    db_session.commit()

    monkeypatch.setattr(GbpSyncService, "_client", lambda self, _org_id: _FakeGoogleClient())

    result = ReviewProviderRegistry(db_session).adapter(ReviewProvider.GOOGLE).sync_reviews(
        organization_id=org.id,
        location_id=location.id,
    )

    assert result.status == "synced"
    assert result.count == 1
    status = ReviewProviderRegistry(db_session).status(organization_id=org.id, location_id=location.id)
    google = next(row for row in status if row["provider"] == "google")
    assert google["configured"] is True
    assert google["mapped_reviews"] == 1


def test_non_google_review_providers_report_required_access(db_session):
    org = Organization(name="Manual Reviews Org", org_type=OrganizationType.BUSINESS)
    db_session.add(org)
    db_session.flush()
    location = Location(name="Main", organization_id=org.id, timezone="UTC")
    db_session.add(location)
    db_session.commit()

    result = ReviewProviderRegistry(db_session).adapter(ReviewProvider.YELP).sync_reviews(
        organization_id=org.id,
        location_id=location.id,
    )

    assert result.status == "not_configured"
    assert "approved API/partner access" in (result.message or "")

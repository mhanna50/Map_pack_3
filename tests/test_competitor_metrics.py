from __future__ import annotations

from datetime import datetime, timedelta, timezone

from backend.app.models.competitor_profile import CompetitorProfile
from backend.app.models.connected_account import ConnectedAccount
from backend.app.models.enums import OrganizationType, ProviderType
from backend.app.models.location import Location
from backend.app.models.organization import Organization
from backend.app.services.competitor_monitoring import CompetitorMetricsFetcher
from backend.app.services.encryption import get_encryption_service
from backend.app.services.google import GoogleBusinessClient


def _setup_location_with_account(db_session):
    org = Organization(name="Metrics Org", org_type=OrganizationType.AGENCY)
    db_session.add(org)
    db_session.flush()
    location = Location(name="Metrics Location", organization_id=org.id, timezone="UTC")
    db_session.add(location)
    db_session.flush()
    encryptor = get_encryption_service()
    account = ConnectedAccount(
        organization_id=org.id,
        provider=ProviderType.GOOGLE_BUSINESS,
        external_account_id="accounts/123",
        display_name="Metrics Account",
        encrypted_access_token=encryptor.encrypt("token"),
        encrypted_refresh_token=encryptor.encrypt("refresh"),
    )
    account.access_token_expires_at = datetime.now(timezone.utc) + timedelta(hours=2)
    db_session.add(account)
    db_session.flush()
    location.connected_account_id = account.id
    db_session.add(location)
    db_session.commit()
    return org, location, account


def test_fetcher_uses_manual_metrics(db_session):
    org, location, _ = _setup_location_with_account(db_session)
    competitor = CompetitorProfile(
        organization_id=org.id,
        location_id=location.id,
        name="Manual Rival",
        metadata_json={
            "metrics": {
                "review_count": 80,
                "average_rating": 4.8,
                "review_velocity_per_week": 3.5,
                "posting_frequency_per_week": 1.25,
                "photo_count": 40,
                "shares_offers": True,
            }
        },
    )
    db_session.add(competitor)
    db_session.commit()

    fetcher = CompetitorMetricsFetcher(db_session)
    metrics = fetcher.fetch_metrics(competitor)
    assert metrics == {
        "review_count": 80,
        "average_rating": 4.8,
        "review_velocity": 3.5,
        "posting_frequency": 1.25,
        "photo_count": 40,
        "shares_offers": True,
    }


def test_fetcher_uses_google_data_when_available(db_session, monkeypatch):
    org, location, _ = _setup_location_with_account(db_session)
    competitor = CompetitorProfile(
        organization_id=org.id,
        location_id=location.id,
        name="Google Rival",
        google_location_id="accounts/123/locations/999",
    )
    db_session.add(competitor)
    db_session.commit()

    now = datetime.now(timezone.utc)

    def fake_reviews(self, location_name):
        assert location_name == competitor.google_location_id
        return [
            {"starRating": 5, "updateTime": now.isoformat()},
            {"starRating": 4, "updateTime": (now - timedelta(days=40)).isoformat()},
        ]

    def fake_posts(self, location_name):
        return [
            {"createTime": now.isoformat(), "topicType": "OFFER"},
            {"createTime": (now - timedelta(days=10)).isoformat(), "topicType": "STANDARD"},
        ]

    def fake_media(self, location_name):
        return [{"mediaFormat": "PHOTO"}, {"mediaFormat": "PHOTO"}, {"mediaFormat": "PHOTO"}]

    monkeypatch.setattr(GoogleBusinessClient, "list_reviews", fake_reviews, raising=False)
    monkeypatch.setattr(GoogleBusinessClient, "list_local_posts", fake_posts, raising=False)
    monkeypatch.setattr(GoogleBusinessClient, "list_media", fake_media, raising=False)

    fetcher = CompetitorMetricsFetcher(db_session)
    metrics = fetcher.fetch_metrics(competitor)
    assert metrics["review_count"] == 2
    assert metrics["average_rating"] == 4.5
    # only one review is recent (within 28 days)
    assert metrics["review_velocity"] == 0.25
    assert metrics["posting_frequency"] == 0.5
    assert metrics["photo_count"] == 3
    assert metrics["shares_offers"] is True

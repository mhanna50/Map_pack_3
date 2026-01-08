from __future__ import annotations

import uuid
from backend.app.core.config import settings
from backend.app.models.action import Action
from backend.app.models.enums import LocationStatus, OrganizationType
from backend.app.models.location import Location
from backend.app.models.organization import Organization
from backend.app.services.google import OAuthStateSigner, GoogleOAuthService, GoogleBusinessClient


def _setup_org(db_session) -> Organization:
    org = Organization(name="GBP Org", org_type=OrganizationType.AGENCY)
    db_session.add(org)
    db_session.commit()
    return org


def test_gbp_connection_flow(api_client, db_session, monkeypatch):
    settings.GOOGLE_CLIENT_ID = "client-id"
    settings.GOOGLE_CLIENT_SECRET = "client-secret"
    settings.GOOGLE_OAUTH_REDIRECT_URI = "https://example.com/oauth"
    org = _setup_org(db_session)

    start_resp = api_client.post(f"/api/orgs/{org.id}/gbp/connect/start", json={})
    assert start_resp.status_code == 200
    assert "client-id" in start_resp.json()["authorization_url"]

    def fake_exchange(self, *, code, redirect_uri=None):
        return {
            "access_token": "access-token",
            "refresh_token": "refresh-token",
            "expires_in": 3600,
            "scope": "scope1 scope2",
        }

    monkeypatch.setattr(GoogleOAuthService, "exchange_code_for_tokens", fake_exchange)
    monkeypatch.setattr(
        GoogleBusinessClient,
        "list_accounts",
        lambda self: [{"name": "accounts/123", "accountName": "owner@example.com"}],
    )
    monkeypatch.setattr(
        GoogleBusinessClient,
        "list_locations",
        lambda self, account_name: [
            {
                "name": "locations/abc",
                "title": "Main HQ",
                "latlng": {"latitude": 40.0, "longitude": -70.0},
                "storefrontAddress": {"postalCode": "12345"},
                "metadata": {"placeStatus": "PUBLISHED", "placeId": "place123"},
            }
        ],
    )

    state = OAuthStateSigner().encode({"org_id": str(org.id)})
    callback = api_client.get(
        f"/api/orgs/{org.id}/gbp/connect/callback",
        params={"state": state, "code": "abc"},
    )
    assert callback.status_code == 200
    assert callback.json()["google_account_email"] == "owner@example.com"

    import_resp = api_client.post(f"/api/orgs/{org.id}/locations/import")
    assert import_resp.status_code == 200
    payload = import_resp.json()
    assert payload["imported"] == 1
    location_id = uuid.UUID(payload["location_ids"][0])
    location = db_session.get(Location, location_id)
    assert location.latitude == 40.0
    assert location.status == LocationStatus.ACTIVE
    assert location.last_sync_at is not None

    patch_resp = api_client.patch(
        f"/api/orgs/{org.id}/locations/{location_id}",
        json={
            "name": "Renamed",
            "settings": {"keywords": ["hvac"]},
        },
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["name"] == "Renamed"
    db_session.refresh(location)
    assert location.settings.keywords == ["hvac"]

    sync_resp = api_client.post(
        f"/api/orgs/{org.id}/locations/{location_id}/sync",
    )
    assert sync_resp.status_code == 200
    assert sync_resp.json()["scheduled"] is True
    actions = db_session.query(Action).filter(Action.location_id == location_id).all()
    assert actions, "Expected a sync action to be scheduled"

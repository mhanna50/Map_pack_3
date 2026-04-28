from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from backend.app.core.config import settings
from backend.app.models.automation.action import Action
from backend.app.models.enums import GbpConnectionStatus, LocationStatus, OrganizationType
from backend.app.models.google_business.location import Location
from backend.app.models.identity.organization import Organization
from backend.app.services.google_business.gbp_connections import GbpConnectionService
from backend.app.services.google_business.google import OAuthStateSigner, GoogleOAuthService, GoogleBusinessClient


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
            "scope": "https://www.googleapis.com/auth/business.manage",
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

    disconnect_resp = api_client.delete(f"/api/orgs/{org.id}/gbp/connect")
    assert disconnect_resp.status_code == 200
    assert disconnect_resp.json()["status"] == "disconnected"

    reconnect = api_client.get(
        f"/api/orgs/{org.id}/gbp/connect/callback",
        params={"state": state, "code": "abc"},
    )
    assert reconnect.status_code == 200
    assert reconnect.json()["status"] == "connected"


def test_gbp_connection_start_rejects_unsupported_scope(api_client, db_session):
    settings.GOOGLE_CLIENT_ID = "client-id"
    settings.GOOGLE_OAUTH_REDIRECT_URI = "https://example.com/oauth"
    org = _setup_org(db_session)

    response = api_client.post(
        f"/api/orgs/{org.id}/gbp/connect/start",
        json={"scopes": ["https://www.googleapis.com/auth/drive"]},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Unsupported Google OAuth scope requested"


def test_gbp_refresh_failure_marks_connection_expired(db_session):
    org = _setup_org(db_session)
    service = GbpConnectionService(db_session)
    connection = service.upsert_connection(
        organization_id=org.id,
        google_account_email="owner@example.com",
        account_resource_name="accounts/123",
        scopes=["https://www.googleapis.com/auth/business.manage"],
        access_token="access-token",
        refresh_token="refresh-token",
        expires_in=-60,
    )
    connection.access_token_expires_at = datetime.now(timezone.utc) - timedelta(minutes=5)
    db_session.add(connection)
    db_session.commit()

    def refresh_callback(refresh_token: str):
        raise RuntimeError("invalid_grant: refresh-token")

    try:
        service.ensure_access_token(connection, refresh_callback=refresh_callback)
    except ValueError as exc:
        assert str(exc) == "Google authorization expired; reconnect Google Business Profile"
        assert "refresh-token" not in str(exc)
    else:
        raise AssertionError("Expected refresh failure")

    db_session.refresh(connection)
    assert connection.status == GbpConnectionStatus.EXPIRED

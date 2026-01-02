from __future__ import annotations

from datetime import datetime, timezone
from typing import cast

from backend.app.core.config import settings
from backend.app.models.enums import OrganizationType
from backend.app.models.organization import Organization
from backend.app.services.google import GoogleBusinessClient, GoogleOAuthService
from pydantic import AnyHttpUrl


def test_google_oauth_start_and_callback(api_client, db_session, monkeypatch):
    org = Organization(name="OAuth Org", org_type=OrganizationType.AGENCY)
    db_session.add(org)
    db_session.commit()

    settings.GOOGLE_CLIENT_ID = "client-id.apps.googleusercontent.com"
    settings.GOOGLE_CLIENT_SECRET = "secret"
    settings.GOOGLE_OAUTH_REDIRECT_URI = cast(AnyHttpUrl, "https://example.com/callback")

    fake_authorization_url = "https://accounts.google.com/o/oauth2/auth?state=fake"

    def fake_build(self, **kwargs):
        return fake_authorization_url

    monkeypatch.setattr(GoogleOAuthService, "build_authorization_url", fake_build, raising=False)

    start_response = api_client.post(
        "/api/google/oauth/start",
        json={"organization_id": str(org.id), "scopes": ["https://www.googleapis.com/auth/business.manage"]},
    )
    assert start_response.status_code == 200
    start_data = start_response.json()
    assert start_data["authorization_url"] == fake_authorization_url
    state = start_data["state"]

    token_payload = {
        "access_token": "access-token",
        "refresh_token": "refresh-token",
        "expires_in": 3600,
        "scope": "https://www.googleapis.com/auth/business.manage",
    }

    def fake_exchange(self, **kwargs):
        return token_payload

    monkeypatch.setattr(GoogleOAuthService, "exchange_code_for_tokens", fake_exchange, raising=False)

    def fake_list_accounts(self):
        return [
            {
                "name": "accounts/123",
                "accountName": "Test Account",
            }
        ]

    monkeypatch.setattr(GoogleBusinessClient, "list_accounts", fake_list_accounts, raising=False)

    callback_response = api_client.post(
        "/api/google/oauth/callback",
        json={"code": "auth-code", "state": state},
    )
    assert callback_response.status_code == 200
    callback_data = callback_response.json()
    assert len(callback_data["connected_accounts"]) == 1

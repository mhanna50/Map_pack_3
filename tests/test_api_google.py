from __future__ import annotations

from datetime import datetime, timezone
from typing import cast

import httpx
import pytest
from fastapi import HTTPException

from backend.app.core.config import settings
from backend.app.models.enums import OrganizationType
from backend.app.models.google_business.gbp_connection import GbpConnection
from backend.app.models.identity.organization import Organization
from backend.app.services.integrations.health import IntegrationHealthService
from backend.app.services.google_business.google import GoogleBusinessClient, GoogleOAuthService
from pydantic import AnyHttpUrl


def test_google_oauth_start_and_callback(api_client, db_session, monkeypatch):
    org = Organization(name="OAuth Org", org_type=OrganizationType.AGENCY)
    db_session.add(org)
    db_session.commit()

    settings.GOOGLE_CLIENT_ID = "client-id.apps.googleusercontent.com"
    settings.GOOGLE_CLIENT_SECRET = "secret"
    settings.GOOGLE_OAUTH_REDIRECT_URI = cast(AnyHttpUrl, "https://example.com/callback")
    settings.CLIENT_APP_URL = cast(AnyHttpUrl, "https://client.example.test")

    fake_authorization_url = "https://accounts.google.com/o/oauth2/auth?state=fake"
    captured_start = {}

    def fake_build(self, **kwargs):
        captured_start.update(kwargs)
        return fake_authorization_url

    monkeypatch.setattr(GoogleOAuthService, "build_authorization_url", fake_build, raising=False)

    start_response = api_client.post(
        "/api/google/oauth/start",
        json={
            "organization_id": str(org.id),
            "redirect_uri": "https://client.example.test/onboarding/google/callback",
            "scopes": ["https://www.googleapis.com/auth/business.manage"],
        },
    )
    assert start_response.status_code == 200
    start_data = start_response.json()
    assert start_data["authorization_url"] == fake_authorization_url
    state = start_data["state"]
    assert captured_start["scopes"] == ["https://www.googleapis.com/auth/business.manage"]

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
        json={
            "code": "auth-code",
            "state": state,
            "redirect_uri": "https://client.example.test/onboarding/google/callback",
        },
    )
    assert callback_response.status_code == 200
    callback_data = callback_response.json()
    assert len(callback_data["connected_accounts"]) == 1
    assert "access-token" not in callback_response.text
    assert "refresh-token" not in callback_response.text
    account_id = callback_data["connected_accounts"][0]["id"]
    reconnected = db_session.query(GbpConnection).filter(GbpConnection.organization_id == org.id).one()
    assert reconnected.account_resource_name == "accounts/123"
    assert reconnected.encrypted_access_token is not None
    assert reconnected.encrypted_refresh_token is not None

    def fake_get_location(self, location_name):
        assert location_name == "accounts/123/locations/456"
        return {
            "name": "accounts/123/locations/456",
            "title": "Main Office",
            "metadata": {"placeStatus": "PUBLISHED"},
        }

    monkeypatch.setattr(GoogleBusinessClient, "get_location", fake_get_location, raising=False)

    connect_response = api_client.post(
        f"/api/google/accounts/{account_id}/locations/connect",
        json={
            "organization_id": str(org.id),
            "location_name": "accounts/123/locations/456",
        },
    )
    assert connect_response.status_code == 200
    connection = (
        db_session.query(GbpConnection)
        .filter(GbpConnection.organization_id == org.id)
        .one()
    )
    assert connection.user_id is not None
    assert connection.account_resource_name == "accounts/123"
    assert connection.encrypted_access_token is not None
    assert connection.encrypted_refresh_token is not None
    assert "access-token" not in connect_response.text
    assert "refresh-token" not in connect_response.text


def test_google_oauth_callback_resolves_reconnect_prompt(api_client, db_session, monkeypatch):
    org = Organization(name="Reconnect Org", org_type=OrganizationType.AGENCY, posting_paused=True)
    db_session.add(org)
    db_session.commit()
    IntegrationHealthService(db_session).create_client_reconnect_prompt(tenant_id=org.id)

    settings.GOOGLE_CLIENT_ID = "client-id.apps.googleusercontent.com"
    settings.GOOGLE_CLIENT_SECRET = "secret"
    settings.GOOGLE_OAUTH_REDIRECT_URI = cast(AnyHttpUrl, "https://example.com/callback")
    settings.CLIENT_APP_URL = cast(AnyHttpUrl, "https://client.example.test")

    start_response = api_client.post(
        "/api/google/oauth/start",
        json={
            "organization_id": str(org.id),
            "redirect_uri": "https://client.example.test/onboarding/google/callback",
        },
    )
    state = start_response.json()["state"]
    monkeypatch.setattr(
        GoogleOAuthService,
        "exchange_code_for_tokens",
        lambda self, **kwargs: {
            "access_token": "new-access-token",
            "refresh_token": "new-refresh-token",
            "expires_in": 3600,
            "scope": "https://www.googleapis.com/auth/business.manage",
        },
        raising=False,
    )
    monkeypatch.setattr(
        GoogleBusinessClient,
        "list_accounts",
        lambda self: [{"name": "accounts/999", "accountName": "Reconnect Account"}],
        raising=False,
    )

    callback_response = api_client.post(
        "/api/google/oauth/callback",
        json={
            "code": "auth-code",
            "state": state,
            "redirect_uri": "https://client.example.test/onboarding/google/callback",
        },
    )

    assert callback_response.status_code == 200
    db_session.refresh(org)
    assert org.posting_paused is False
    assert IntegrationHealthService(db_session).list_client_prompts(org.id) == []
    connection = db_session.query(GbpConnection).filter(GbpConnection.organization_id == org.id).one()
    assert connection.account_resource_name == "accounts/999"


def test_google_oauth_start_rejects_unsupported_scope(api_client, db_session):
    org = Organization(name="OAuth Org", org_type=OrganizationType.AGENCY)
    db_session.add(org)
    db_session.commit()
    settings.GOOGLE_CLIENT_ID = "client-id.apps.googleusercontent.com"
    settings.GOOGLE_OAUTH_REDIRECT_URI = cast(AnyHttpUrl, "https://example.com/callback")

    response = api_client.post(
        "/api/google/oauth/start",
        json={
            "organization_id": str(org.id),
            "scopes": ["https://www.googleapis.com/auth/drive"],
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Unsupported Google OAuth scope requested"


def test_google_oauth_callback_rejects_mismatched_redirect(api_client, db_session):
    org = Organization(name="OAuth Org", org_type=OrganizationType.AGENCY)
    db_session.add(org)
    db_session.commit()
    settings.GOOGLE_CLIENT_ID = "client-id.apps.googleusercontent.com"
    settings.GOOGLE_CLIENT_SECRET = "secret"
    settings.GOOGLE_OAUTH_REDIRECT_URI = cast(AnyHttpUrl, "https://example.com/callback")
    settings.CLIENT_APP_URL = cast(AnyHttpUrl, "https://client.example.test")

    start_response = api_client.post(
        "/api/google/oauth/start",
        json={
            "organization_id": str(org.id),
            "redirect_uri": "https://client.example.test/onboarding/google/callback",
        },
    )
    state = start_response.json()["state"]

    response = api_client.post(
        "/api/google/oauth/callback",
        json={
            "code": "auth-code",
            "state": state,
            "redirect_uri": "https://example.com/callback",
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Mismatched OAuth redirect URI"


def test_google_business_client_lists_accounts_from_account_management_api(monkeypatch):
    settings.GOOGLE_ACCOUNT_MANAGEMENT_API_BASE_URL = cast(
        AnyHttpUrl, "https://account-management.example.test/v1"
    )
    client = GoogleBusinessClient("access-token")
    calls = []

    def fake_get(self, endpoint, params=None):
        calls.append((endpoint, dict(params or {})))
        if len(calls) == 1:
            return {
                "accounts": [{"name": "accounts/1"}],
                "nextPageToken": "next-page",
            }
        return {"accounts": [{"name": "accounts/2"}]}

    monkeypatch.setattr(GoogleBusinessClient, "_get", fake_get, raising=False)

    assert client.list_accounts() == [
        {"name": "accounts/1"},
        {"name": "accounts/2"},
    ]
    assert calls[0] == (
        "https://account-management.example.test/v1/accounts",
        {"pageSize": 20},
    )
    assert calls[1] == (
        "https://account-management.example.test/v1/accounts",
        {"pageSize": 20, "pageToken": "next-page"},
    )


def test_google_business_client_lists_locations_with_read_mask(monkeypatch):
    settings.GOOGLE_BUSINESS_API_BASE_URL = cast(
        AnyHttpUrl, "https://business-info.example.test/v1"
    )
    client = GoogleBusinessClient("access-token")
    calls = []

    def fake_get(self, endpoint, params=None):
        calls.append((endpoint, dict(params or {})))
        if len(calls) == 1:
            return {
                "locations": [{"name": "locations/1"}],
                "nextPageToken": "next-page",
            }
        return {"locations": [{"name": "locations/2"}]}

    monkeypatch.setattr(GoogleBusinessClient, "_get", fake_get, raising=False)

    assert client.list_locations("accounts/123") == [
        {"name": "locations/1"},
        {"name": "locations/2"},
    ]
    first_endpoint, first_params = calls[0]
    second_endpoint, second_params = calls[1]
    assert (
        first_endpoint
        == "https://business-info.example.test/v1/accounts/123/locations"
    )
    assert first_params["pageSize"] == 100
    assert "title" in first_params["readMask"]
    assert "storefrontAddress" in first_params["readMask"]
    assert second_endpoint == first_endpoint
    assert second_params["pageToken"] == "next-page"


def test_google_errors_do_not_echo_provider_response_body():
    request = httpx.Request("GET", "https://business.example.test")
    response = httpx.Response(
        401,
        request=request,
        text='{"error":"invalid_grant","access_token":"secret-access-token"}',
    )

    with pytest.raises(HTTPException) as exc_info:
        GoogleBusinessClient._raise_if_error(response)

    assert exc_info.value.detail == "Google Business API request failed"
    assert "secret-access-token" not in str(exc_info.value.detail)


def test_google_oauth_errors_do_not_echo_provider_response_body(monkeypatch):
    class FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return None

        def post(self, url, data):
            request = httpx.Request("POST", url)
            return httpx.Response(
                400,
                request=request,
                text='{"error":"invalid_grant","refresh_token":"secret-refresh-token"}',
            )

    monkeypatch.setattr(httpx, "Client", FakeClient)

    with pytest.raises(HTTPException) as exc_info:
        GoogleOAuthService._post(
            "https://oauth2.googleapis.com/token",
            {"refresh_token": "secret-refresh-token"},
        )

    assert exc_info.value.detail == "Google OAuth request failed"
    assert "secret-refresh-token" not in str(exc_info.value.detail)

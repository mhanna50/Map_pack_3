from __future__ import annotations

from datetime import datetime, timedelta, timezone

from backend.app.models.enums import LocationStatus, OrganizationType
from backend.app.models.google_business.location import Location
from backend.app.models.identity.organization import Organization
from backend.app.services.google_business.connected_accounts import ConnectedAccountService


def test_connected_account_encryption_and_refresh(db_session):
    org = Organization(name="Auth Org", org_type=OrganizationType.AGENCY)
    db_session.add(org)
    db_session.commit()

    service = ConnectedAccountService(db_session)
    account = service.upsert_google_account(
        organization_id=org.id,
        external_account_id="accounts/123",
        display_name="Test Account",
        scopes=["scope"],
        access_token="initial-token",
        refresh_token="refresh-token",
        expires_in=60,
        metadata={"source": "test"},
    )

    assert account.encrypted_access_token is not None
    decrypted = service.encryptor.decrypt(account.encrypted_access_token)
    assert decrypted == "initial-token"

    account.access_token_expires_at = datetime.now(timezone.utc) - timedelta(seconds=10)
    db_session.add(account)
    db_session.commit()

    refreshed = {"called": False}

    def refresh_callback(refresh_token: str):
        refreshed["called"] = True
        assert refresh_token == "refresh-token"
        return {
            "access_token": "refreshed-token",
            "expires_in": 600,
            "refresh_token": "next-refresh-token",
        }

    token = service.ensure_access_token(account, refresh_callback=refresh_callback)
    assert token == "refreshed-token"
    assert refreshed["called"] is True
    assert service.encryptor.decrypt(account.encrypted_access_token) == "refreshed-token"


def test_connected_account_refresh_failure_returns_reconnect_error(db_session):
    org = Organization(name="Auth Org", org_type=OrganizationType.AGENCY)
    db_session.add(org)
    db_session.commit()

    service = ConnectedAccountService(db_session)
    account = service.upsert_google_account(
        organization_id=org.id,
        external_account_id="accounts/123",
        display_name="Test Account",
        scopes=["https://www.googleapis.com/auth/business.manage"],
        access_token="initial-token",
        refresh_token="refresh-token",
        expires_in=-60,
    )

    def refresh_callback(refresh_token: str):
        raise RuntimeError("invalid_grant: refresh-token")

    try:
        service.ensure_access_token(account, refresh_callback=refresh_callback)
    except ValueError as exc:
        assert str(exc) == "Google authorization expired; reconnect Google Business Profile"
        assert "refresh-token" not in str(exc)
    else:
        raise AssertionError("Expected refresh failure")


def test_disconnect_google_account_clears_tokens_and_marks_locations_disconnected(db_session):
    org = Organization(name="Auth Org", org_type=OrganizationType.AGENCY)
    db_session.add(org)
    db_session.commit()

    service = ConnectedAccountService(db_session)
    account = service.upsert_google_account(
        organization_id=org.id,
        external_account_id="accounts/123",
        display_name="Test Account",
        scopes=["https://www.googleapis.com/auth/business.manage"],
        access_token="initial-token",
        refresh_token="refresh-token",
        expires_in=3600,
    )
    location = Location(
        organization_id=org.id,
        tenant_id=org.id,
        connected_account_id=account.id,
        name="Main",
        timezone="UTC",
        google_location_id="locations/123",
        status=LocationStatus.ACTIVE,
    )
    db_session.add(location)
    db_session.commit()

    service.disconnect_google_account(account)

    db_session.refresh(account)
    db_session.refresh(location)
    assert account.encrypted_access_token is None
    assert account.encrypted_refresh_token is None
    assert account.access_token_expires_at is None
    assert location.status == LocationStatus.DISCONNECTED

    reconnected = service.upsert_google_account(
        organization_id=org.id,
        external_account_id="accounts/123",
        display_name="Test Account",
        scopes=["https://www.googleapis.com/auth/business.manage"],
        access_token="new-access-token",
        refresh_token="new-refresh-token",
        expires_in=3600,
    )

    assert reconnected.id == account.id
    assert reconnected.encrypted_access_token is not None
    assert service.encryptor.decrypt(reconnected.encrypted_access_token) == "new-access-token"
    assert reconnected.encrypted_refresh_token is not None
    assert service.encryptor.decrypt(reconnected.encrypted_refresh_token) == "new-refresh-token"

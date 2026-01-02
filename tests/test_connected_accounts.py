from __future__ import annotations

from datetime import datetime, timedelta, timezone

from backend.app.models.enums import OrganizationType
from backend.app.models.organization import Organization
from backend.app.services.connected_accounts import ConnectedAccountService


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

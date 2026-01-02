from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
import uuid

from sqlalchemy.orm import Session

from ..models.connected_account import ConnectedAccount
from ..models.enums import ProviderType
from .encryption import get_encryption_service


class ConnectedAccountService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.encryptor = get_encryption_service()

    def upsert_google_account(
        self,
        *,
        organization_id: uuid.UUID,
        external_account_id: str,
        display_name: str | None,
        scopes: list[str],
        access_token: str,
        refresh_token: str | None,
        expires_in: int,
        metadata: dict[str, Any] | None = None,
    ) -> ConnectedAccount:
        account = (
            self.db.query(ConnectedAccount)
            .filter(
                ConnectedAccount.organization_id == organization_id,
                ConnectedAccount.provider == ProviderType.GOOGLE_BUSINESS,
                ConnectedAccount.external_account_id == external_account_id,
            )
            .one_or_none()
        )

        encrypted_refresh = (
            self.encryptor.encrypt(refresh_token)
            if refresh_token
            else account.encrypted_refresh_token if account else None
        )

        access_token_expires_at = datetime.now(timezone.utc) + timedelta(
            seconds=expires_in or 3600
        )

        if account:
            account.display_name = display_name
            account.scopes = scopes
            account.encrypted_access_token = self.encryptor.encrypt(access_token)
            if encrypted_refresh:
                account.encrypted_refresh_token = encrypted_refresh
            account.access_token_expires_at = access_token_expires_at
            account.metadata_json = metadata or {}
        else:
            account = ConnectedAccount(
                organization_id=organization_id,
                provider=ProviderType.GOOGLE_BUSINESS,
                external_account_id=external_account_id,
                display_name=display_name,
                scopes=scopes,
                encrypted_access_token=self.encryptor.encrypt(access_token),
                encrypted_refresh_token=encrypted_refresh,
                access_token_expires_at=access_token_expires_at,
                metadata_json=metadata or {},
            )
            self.db.add(account)

        self.db.commit()
        self.db.refresh(account)
        return account

    def ensure_access_token(
        self,
        account: ConnectedAccount,
        *,
        refresh_callback,
    ) -> str:
        """
        Returns a valid access token for the connected account, refreshing if needed.
        `refresh_callback` receives the decrypted refresh token and must return
        a dict with access_token/expires_in (and optionally refresh_token).
        """
        decrypt = self.encryptor.decrypt
        if not account.encrypted_access_token:
            raise ValueError("Connected account is missing an access token")
        access_token = decrypt(account.encrypted_access_token)
        expires_at = account.access_token_expires_at or datetime.now(timezone.utc)
        now = datetime.now(timezone.utc)

        if expires_at - now > timedelta(seconds=60):
            return access_token

        if not account.encrypted_refresh_token:
            raise ValueError("Cannot refresh Google token without refresh_token")

        refresh_payload = refresh_callback(decrypt(account.encrypted_refresh_token))
        access_token = refresh_payload["access_token"]
        expires_in = refresh_payload.get("expires_in", 3600)
        new_refresh = refresh_payload.get("refresh_token")

        account.encrypted_access_token = self.encryptor.encrypt(access_token)
        if new_refresh:
            account.encrypted_refresh_token = self.encryptor.encrypt(new_refresh)
        account.access_token_expires_at = now + timedelta(seconds=expires_in)
        self.db.add(account)
        self.db.commit()
        self.db.refresh(account)

        return access_token

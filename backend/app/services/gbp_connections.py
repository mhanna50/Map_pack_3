from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Callable
import uuid

from sqlalchemy.orm import Session

from backend.app.models.enums import GbpConnectionStatus, LocationStatus
from backend.app.models.gbp_connection import GbpConnection
from backend.app.models.location import Location
from backend.app.services.encryption import get_encryption_service
from backend.app.services.google import GoogleBusinessClient, GoogleOAuthService


class GbpConnectionService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.encryptor = get_encryption_service()

    def get_by_org(self, organization_id: uuid.UUID) -> GbpConnection | None:
        return (
            self.db.query(GbpConnection)
            .filter(GbpConnection.organization_id == organization_id)
            .one_or_none()
        )

    def upsert_connection(
        self,
        *,
        organization_id: uuid.UUID,
        google_account_email: str | None,
        account_resource_name: str | None,
        scopes: list[str] | None,
        access_token: str,
        refresh_token: str | None,
        expires_in: int | None,
        metadata: dict[str, Any] | None = None,
    ) -> GbpConnection:
        connection = self.get_by_org(organization_id)
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in or 3600)
        encrypted_access = self.encryptor.encrypt(access_token)
        encrypted_refresh = self.encryptor.encrypt(refresh_token) if refresh_token else None
        if connection:
            connection.google_account_email = google_account_email or connection.google_account_email
            connection.account_resource_name = account_resource_name or connection.account_resource_name
            connection.scopes = scopes or connection.scopes
            connection.status = GbpConnectionStatus.CONNECTED
            connection.encrypted_access_token = encrypted_access
            if encrypted_refresh:
                connection.encrypted_refresh_token = encrypted_refresh
            connection.access_token_expires_at = expires_at
            connection.metadata_json = metadata or connection.metadata_json or {}
        else:
            connection = GbpConnection(
                organization_id=organization_id,
                google_account_email=google_account_email,
                account_resource_name=account_resource_name,
                scopes=scopes or [],
                status=GbpConnectionStatus.CONNECTED,
                encrypted_access_token=encrypted_access,
                encrypted_refresh_token=encrypted_refresh,
                access_token_expires_at=expires_at,
                metadata_json=metadata or {},
            )
            self.db.add(connection)
        self.db.commit()
        self.db.refresh(connection)
        return connection

    def ensure_access_token(
        self,
        connection: GbpConnection,
        *,
        refresh_callback: Callable[[str], dict[str, Any]],
    ) -> str:
        if not connection.encrypted_access_token:
            raise ValueError("GBP connection missing access token")
        decrypt = self.encryptor.decrypt
        access_token = decrypt(connection.encrypted_access_token)
        expires_at = connection.access_token_expires_at or datetime.now(timezone.utc)
        now = datetime.now(timezone.utc)
        if expires_at - now > timedelta(seconds=60):
            return access_token
        if not connection.encrypted_refresh_token:
            raise ValueError("Cannot refresh GBP token without refresh_token")
        payload = refresh_callback(decrypt(connection.encrypted_refresh_token))
        access_token = payload["access_token"]
        expires_in = payload.get("expires_in", 3600)
        new_refresh = payload.get("refresh_token")
        connection.encrypted_access_token = self.encryptor.encrypt(access_token)
        if new_refresh:
            connection.encrypted_refresh_token = self.encryptor.encrypt(new_refresh)
        connection.access_token_expires_at = now + timedelta(seconds=expires_in)
        self.db.add(connection)
        self.db.commit()
        self.db.refresh(connection)
        return access_token


class GbpLocationSyncService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.connections = GbpConnectionService(db)
        self.oauth = GoogleOAuthService()

    def import_locations(self, organization_id: uuid.UUID) -> list[Location]:
        connection = self.connections.get_by_org(organization_id)
        if not connection:
            raise ValueError("Organization has no GBP connection")
        token = self.connections.ensure_access_token(
            connection,
            refresh_callback=self.oauth.refresh_access_token,
        )
        client = GoogleBusinessClient(token)
        account_name = self._ensure_account_reference(connection, client)
        google_locations = client.list_locations(account_name)
        return self._upsert_locations(organization_id, google_locations)

    def _ensure_account_reference(
        self,
        connection: GbpConnection,
        client: GoogleBusinessClient,
    ) -> str:
        if connection.account_resource_name:
            return connection.account_resource_name
        accounts = client.list_accounts()
        if not accounts:
            raise ValueError("No Google Business accounts available for connection")
        account = accounts[0]
        connection.account_resource_name = account.get("name")
        if account.get("accountName"):
            connection.google_account_email = account["accountName"]
        self.db.add(connection)
        self.db.commit()
        self.db.refresh(connection)
        return connection.account_resource_name or account["name"]

    def _upsert_locations(
        self,
        organization_id: uuid.UUID,
        locations: list[dict[str, Any]],
    ) -> list[Location]:
        now = datetime.now(timezone.utc)
        existing = {
            loc.google_location_id: loc
            for loc in self.db.query(Location)
            .filter(Location.organization_id == organization_id)
            .all()
            if loc.google_location_id
        }
        updated: list[Location] = []
        for payload in locations:
            google_id = payload.get("name")
            if not google_id:
                continue
            location = existing.get(google_id)
            if not location:
                location = Location(
                    organization_id=organization_id,
                    name=payload.get("title") or payload.get("locationName") or "Google Location",
                    timezone="UTC",
                    google_location_id=google_id,
                    status=LocationStatus.DRAFT,
                )
                self.db.add(location)
            location.name = payload.get("title") or payload.get("locationName") or location.name
            storefront_address = payload.get("storefrontAddress") or payload.get("address")
            if storefront_address:
                location.address = storefront_address
            latlng = payload.get("latlng") or {}
            location.latitude = latlng.get("latitude")
            location.longitude = latlng.get("longitude")
            place_status = (payload.get("metadata") or {}).get("placeStatus")
            if place_status == "PUBLISHED":
                location.status = LocationStatus.ACTIVE
            location.last_sync_at = now
            place_id = (payload.get("metadata") or {}).get("placeId")
            if place_id:
                location.external_ids = {"place_id": place_id}
            updated.append(location)
        self.db.commit()
        for location in updated:
            self.db.refresh(location)
        return updated

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..db.session import get_db
from ..models.enums import ActionType, LocationStatus
from ..models.location import Location
from ..models.location_settings import LocationSettings
from ..services.actions import ActionService
from ..services.audit import log_audit
from ..services.gbp_connections import GbpConnectionService, GbpLocationSyncService
from ..services.google import GoogleBusinessClient, GoogleOAuthService, OAuthStateSigner
from .orgs import LocationResponse, LocationSettingsPayload

router = APIRouter(prefix="/orgs/{organization_id}", tags=["organizations"])

GBP_DEFAULT_SCOPES = ["https://www.googleapis.com/auth/business.manage"]


class GbpConnectStartRequest(BaseModel):
    scopes: list[str] | None = None
    redirect_uri: str | None = None


class GbpConnectStartResponse(BaseModel):
    authorization_url: str


@router.post("/gbp/connect/start", response_model=GbpConnectStartResponse)
def gbp_connect_start(
    organization_id: uuid.UUID,
    payload: GbpConnectStartRequest | None = None,
) -> GbpConnectStartResponse:
    scopes = payload.scopes or GBP_DEFAULT_SCOPES
    signer = OAuthStateSigner()
    state = signer.encode({"org_id": str(organization_id)})
    oauth = GoogleOAuthService()
    url = oauth.build_authorization_url(
        state=state,
        scopes=scopes,
        redirect_uri=payload.redirect_uri if payload else None,
    )
    return GbpConnectStartResponse(authorization_url=url)


class GbpConnectCallbackResponse(BaseModel):
    organization_id: uuid.UUID
    google_account_email: str | None
    status: str


@router.get("/gbp/connect/callback", response_model=GbpConnectCallbackResponse)
def gbp_connect_callback(
    organization_id: uuid.UUID,
    state: str = Query(...),
    code: str = Query(...),
    db: Session = Depends(get_db),
) -> GbpConnectCallbackResponse:
    signer = OAuthStateSigner()
    decoded = signer.decode(state)
    if decoded.get("org_id") != str(organization_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Mismatched organization in OAuth state")
    oauth = GoogleOAuthService()
    token_data = oauth.exchange_code_for_tokens(code=code)
    access_token = token_data["access_token"]
    refresh_token = token_data.get("refresh_token")
    scopes_value = token_data.get("scope")
    scopes = scopes_value.split(" ") if isinstance(scopes_value, str) else scopes_value or GBP_DEFAULT_SCOPES
    client = GoogleBusinessClient(access_token)
    accounts = client.list_accounts()
    if not accounts:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No Google Business accounts available")
    primary_account = accounts[0]
    connection_service = GbpConnectionService(db)
    connection = connection_service.upsert_connection(
        organization_id=organization_id,
        google_account_email=primary_account.get("accountName") or token_data.get("email"),
        account_resource_name=primary_account.get("name"),
        scopes=scopes,
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=token_data.get("expires_in"),
        metadata={"accounts": accounts},
    )
    return GbpConnectCallbackResponse(
        organization_id=organization_id,
        google_account_email=connection.google_account_email,
        status=connection.status.value,
    )


class GbpImportResponse(BaseModel):
    imported: int
    location_ids: list[uuid.UUID]


@router.post("/locations/import", response_model=GbpImportResponse)
def import_locations_from_gbp(
    organization_id: uuid.UUID,
    db: Session = Depends(get_db),
) -> GbpImportResponse:
    service = GbpLocationSyncService(db)
    try:
        locations = service.import_locations(organization_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    for location in locations:
        log_audit(
            db,
            action="location.imported",
            org_id=organization_id,
            entity="location",
            entity_id=str(location.id),
            after={"name": location.name, "google_location_id": location.google_location_id},
        )
    return GbpImportResponse(
        imported=len(locations),
        location_ids=[location.id for location in locations],
    )


class LocationUpdateRequest(BaseModel):
    name: str | None = None
    timezone: str | None = None
    status: LocationStatus | None = None
    address: dict | None = None
    settings: LocationSettingsPayload | None = None


@router.patch("/locations/{location_id}", response_model=LocationResponse)
def update_location_details(
    organization_id: uuid.UUID,
    location_id: uuid.UUID,
    payload: LocationUpdateRequest,
    db: Session = Depends(get_db),
) -> LocationResponse:
    location = (
        db.query(Location)
        .filter(Location.organization_id == organization_id, Location.id == location_id)
        .one_or_none()
    )
    if not location:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Location not found")
    data = payload.model_dump(exclude_unset=True)
    before = {
        "name": location.name,
        "timezone": location.timezone,
        "status": location.status.value,
        "address": location.address,
        "settings": location.settings.keywords if location.settings else None,
    }
    if "name" in data:
        location.name = data["name"] or location.name
    if "timezone" in data and data["timezone"]:
        location.timezone = data["timezone"]
    if "status" in data and data["status"]:
        location.status = data["status"]
    if "address" in data and data["address"] is not None:
        location.address = data["address"]
    if payload.settings:
        settings_data = payload.settings.model_dump(exclude_unset=True)
        if location.settings:
            for key, value in settings_data.items():
                setattr(location.settings, key, value)
        else:
            db.add(LocationSettings(location_id=location.id, **settings_data))
    db.add(location)
    db.commit()
    db.refresh(location)
    after = {
        "name": location.name,
        "timezone": location.timezone,
        "status": location.status.value,
        "address": location.address,
        "settings": location.settings.keywords if location.settings else None,
    }
    log_audit(
        db,
        action="location.updated",
        org_id=organization_id,
        entity="location",
        entity_id=str(location.id),
        location_id=location.id,
        before=before,
        after=after,
    )
    return LocationResponse.model_validate(location)


class LocationSyncResponse(BaseModel):
    scheduled: bool
    last_sync_at: datetime | None = None


@router.post("/locations/{location_id}/sync", response_model=LocationSyncResponse)
def sync_location_now(
    organization_id: uuid.UUID,
    location_id: uuid.UUID,
    db: Session = Depends(get_db),
) -> LocationSyncResponse:
    location = (
        db.query(Location)
        .filter(Location.organization_id == organization_id, Location.id == location_id)
        .one_or_none()
    )
    if not location:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Location not found")
    action_service = ActionService(db)
    action_service.schedule_action(
        organization_id=organization_id,
        action_type=ActionType.SYNC_GOOGLE_LOCATIONS,
        run_at=datetime.now(timezone.utc),
        payload={"organization_id": str(organization_id), "location_id": str(location_id)},
        location_id=location_id,
    )
    location.last_sync_at = datetime.now(timezone.utc)
    db.add(location)
    db.commit()
    db.refresh(location)
    return LocationSyncResponse(scheduled=True, last_sync_at=location.last_sync_at)

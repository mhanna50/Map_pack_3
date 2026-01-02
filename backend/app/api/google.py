from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import AnyHttpUrl, BaseModel, Field, ConfigDict
from sqlalchemy.orm import Session

from ..db.session import get_db
from ..models.connected_account import ConnectedAccount
from ..models.enums import LocationStatus, ProviderType
from ..models.organization import Organization
from ..services.connected_accounts import ConnectedAccountService
from ..services.google import (
    GoogleBusinessClient,
    GoogleOAuthService,
    OAuthStateSigner,
)
from ..services.location_onboarding import LocationOnboardingService

DEFAULT_GBP_SCOPES = [
    "https://www.googleapis.com/auth/business.manage",
]

router = APIRouter(prefix="/google", tags=["google"])


class OAuthStartRequest(BaseModel):
    organization_id: uuid.UUID
    redirect_uri: AnyHttpUrl | None = None
    scopes: list[str] = Field(default_factory=lambda: DEFAULT_GBP_SCOPES)


class OAuthStartResponse(BaseModel):
    authorization_url: str
    state: str


@router.post("/oauth/start", response_model=OAuthStartResponse)
def start_oauth(
    payload: OAuthStartRequest, db: Session = Depends(get_db)
) -> OAuthStartResponse:
    organization = db.get(Organization, payload.organization_id)
    if not organization:
        raise HTTPException(status_code=404, detail="Organization not found")
    signer = OAuthStateSigner()
    state_payload = {
        "organization_id": str(payload.organization_id),
        "nonce": str(uuid.uuid4()),
    }
    state = signer.encode(state_payload)
    oauth = GoogleOAuthService()
    authorization_url = oauth.build_authorization_url(
        state=state, scopes=payload.scopes, redirect_uri=payload.redirect_uri
    )
    return OAuthStartResponse(authorization_url=authorization_url, state=state)


class OAuthCallbackRequest(BaseModel):
    code: str
    state: str
    redirect_uri: AnyHttpUrl | None = None


class ConnectedAccountResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    provider: ProviderType
    external_account_id: str | None = None
    display_name: str | None = None
    scopes: list[str] | None = None


class OAuthCallbackResponse(BaseModel):
    connected_accounts: list[ConnectedAccountResponse]


@router.post("/oauth/callback", response_model=OAuthCallbackResponse)
def oauth_callback(
    payload: OAuthCallbackRequest, db: Session = Depends(get_db)
) -> OAuthCallbackResponse:
    signer = OAuthStateSigner()
    decoded = signer.decode(payload.state)
    organization_id = uuid.UUID(decoded["organization_id"])
    organization = db.get(Organization, organization_id)
    if not organization:
        raise HTTPException(status_code=404, detail="Organization not found")

    oauth = GoogleOAuthService()
    token_data = oauth.exchange_code_for_tokens(
        code=payload.code, redirect_uri=payload.redirect_uri
    )
    access_token = token_data["access_token"]
    refresh_token = token_data.get("refresh_token")
    expires_in = token_data.get("expires_in", 3600)
    scopes = token_data.get("scope", "").split()
    if not scopes:
        scopes = DEFAULT_GBP_SCOPES

    client = GoogleBusinessClient(access_token)
    accounts_payload = client.list_accounts()
    if not accounts_payload:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google account returned no GBP accounts",
        )

    connected_accounts: list[ConnectedAccount] = []
    account_service = ConnectedAccountService(db)
    for account in accounts_payload:
        connected_accounts.append(
            account_service.upsert_google_account(
                organization_id=organization_id,
                external_account_id=account.get("name"),
                display_name=account.get("accountName") or account.get("name"),
                scopes=scopes,
                access_token=access_token,
                refresh_token=refresh_token,
                expires_in=expires_in,
                metadata={"raw": account},
            )
        )

    return OAuthCallbackResponse(connected_accounts=connected_accounts)


@router.get("/accounts", response_model=list[ConnectedAccountResponse])
def list_accounts(
    organization_id: uuid.UUID = Query(...),
    db: Session = Depends(get_db),
) -> list[ConnectedAccount]:
    return (
        db.query(ConnectedAccount)
        .filter(
            ConnectedAccount.organization_id == organization_id,
            ConnectedAccount.provider == ProviderType.GOOGLE_BUSINESS,
        )
        .order_by(ConnectedAccount.created_at.desc())
        .all()
    )


class GoogleLocationResponse(BaseModel):
    name: str
    title: str | None = None
    store_code: str | None = None
    metadata: dict[str, Any] | None = None


def _get_connected_account(
    db: Session, account_id: uuid.UUID
) -> ConnectedAccount:
    account = db.get(ConnectedAccount, account_id)
    if not account or account.provider != ProviderType.GOOGLE_BUSINESS:
        raise HTTPException(status_code=404, detail="Connected account not found")
    return account


@router.get(
    "/accounts/{account_id}/locations",
    response_model=list[GoogleLocationResponse],
)
def list_remote_locations(
    account_id: uuid.UUID,
    db: Session = Depends(get_db),
) -> list[GoogleLocationResponse]:
    account = _get_connected_account(db, account_id)
    if not account.external_account_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Connected account is missing external_account_id",
        )
    account_service = ConnectedAccountService(db)
    oauth = GoogleOAuthService()

    def refresh_callback(refresh_token: str) -> dict[str, Any]:
        return oauth.refresh_access_token(refresh_token)

    access_token = account_service.ensure_access_token(
        account, refresh_callback=refresh_callback
    )
    client = GoogleBusinessClient(access_token)
    locations = client.list_locations(account.external_account_id)
    return [
        GoogleLocationResponse(
            name=loc.get("name"),
            title=loc.get("title"),
            store_code=loc.get("storeCode"),
            metadata=loc,
        )
        for loc in locations
    ]


class ConnectLocationRequest(BaseModel):
    organization_id: uuid.UUID
    location_name: str = Field(
        ..., description="Google location resource name (e.g., accounts/123/locations/456)"
    )


class ConnectedLocationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    name: str
    status: LocationStatus
    google_location_id: str | None = None


@router.post(
    "/accounts/{account_id}/locations/connect",
    response_model=ConnectedLocationResponse,
)
def connect_location(
    account_id: uuid.UUID,
    payload: ConnectLocationRequest,
    db: Session = Depends(get_db),
):
    account = _get_connected_account(db, account_id)
    if account.organization_id != payload.organization_id:
        raise HTTPException(status_code=403, detail="Organization mismatch")

    account_service = ConnectedAccountService(db)
    oauth = GoogleOAuthService()

    def refresh_callback(refresh_token: str) -> dict[str, Any]:
        return oauth.refresh_access_token(refresh_token)

    access_token = account_service.ensure_access_token(
        account, refresh_callback=refresh_callback
    )
    client = GoogleBusinessClient(access_token)
    location_payload = client.get_location(payload.location_name)

    onboarding = LocationOnboardingService(db)
    location = onboarding.connect_google_location(
        organization_id=payload.organization_id,
        connected_account_id=account.id,
        location_payload=location_payload,
    )

    return location

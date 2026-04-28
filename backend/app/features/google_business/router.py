from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import AnyHttpUrl, BaseModel, Field, ConfigDict
from sqlalchemy.orm import Session

from backend.app.api.deps import get_current_user
from backend.app.db.session import get_db
from backend.app.models.google_business.connected_account import ConnectedAccount
from backend.app.models.enums import LocationStatus, ProviderType
from backend.app.models.identity.user import User
from backend.app.services.auth.access import AccessDeniedError, AccessService
from backend.app.services.google_business.connected_accounts import ConnectedAccountService
from backend.app.services.google_business.google import (
    DEFAULT_GBP_SCOPES,
    GoogleBusinessClient,
    GoogleOAuthService,
    OAuthStateSigner,
    normalize_granted_gbp_scopes,
    validate_google_oauth_redirect_uri,
    validate_gbp_oauth_scopes,
)
from backend.app.services.onboarding.location_onboarding import LocationOnboardingService

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
    payload: OAuthStartRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> OAuthStartResponse:
    access = AccessService(db)
    try:
        access.resolve_org(user_id=current_user.id, organization_id=payload.organization_id)
    except AccessDeniedError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    signer = OAuthStateSigner()
    redirect_uri = validate_google_oauth_redirect_uri(str(payload.redirect_uri) if payload.redirect_uri else None)
    state_payload = {
        "organization_id": str(payload.organization_id),
        "nonce": str(uuid.uuid4()),
        "redirect_uri": redirect_uri,
    }
    state = signer.encode(state_payload)
    oauth = GoogleOAuthService()
    scopes = validate_gbp_oauth_scopes(payload.scopes)
    authorization_url = oauth.build_authorization_url(
        state=state, scopes=scopes, redirect_uri=redirect_uri
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
    payload: OAuthCallbackRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> OAuthCallbackResponse:
    signer = OAuthStateSigner()
    decoded = signer.decode(payload.state)
    try:
        organization_id = uuid.UUID(str(decoded["organization_id"]))
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid OAuth state parameter") from exc
    redirect_uri = validate_google_oauth_redirect_uri(str(payload.redirect_uri) if payload.redirect_uri else None)
    expected_redirect_uri = decoded.get("redirect_uri")
    if expected_redirect_uri and redirect_uri != expected_redirect_uri:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Mismatched OAuth redirect URI")
    access = AccessService(db)
    try:
        access.resolve_org(user_id=current_user.id, organization_id=organization_id)
    except AccessDeniedError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc

    oauth = GoogleOAuthService()
    token_data = oauth.exchange_code_for_tokens(code=payload.code, redirect_uri=redirect_uri)
    access_token = token_data["access_token"]
    refresh_token = token_data.get("refresh_token")
    expires_in = token_data.get("expires_in", 3600)
    scopes = normalize_granted_gbp_scopes(token_data.get("scope"))

    client = GoogleBusinessClient(access_token)
    accounts_payload = client.list_accounts()
    if not accounts_payload:
        return OAuthCallbackResponse(connected_accounts=[])

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
    current_user: User = Depends(get_current_user),
) -> list[ConnectedAccount]:
    access = AccessService(db)
    try:
        access.resolve_org(user_id=current_user.id, organization_id=organization_id)
    except AccessDeniedError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
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
    current_user: User = Depends(get_current_user),
) -> list[GoogleLocationResponse]:
    account = _get_connected_account(db, account_id)
    access = AccessService(db)
    try:
        access.resolve_org(user_id=current_user.id, organization_id=account.organization_id)
    except AccessDeniedError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    if not account.external_account_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Connected account is missing external_account_id",
        )
    account_service = ConnectedAccountService(db)
    oauth = GoogleOAuthService()

    def refresh_callback(refresh_token: str) -> dict[str, Any]:
        return oauth.refresh_access_token(refresh_token)

    try:
        access_token = account_service.ensure_access_token(
            account, refresh_callback=refresh_callback
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
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
    current_user: User = Depends(get_current_user),
):
    account = _get_connected_account(db, account_id)
    if account.organization_id != payload.organization_id:
        raise HTTPException(status_code=403, detail="Organization mismatch")
    access = AccessService(db)
    try:
        access.resolve_org(user_id=current_user.id, organization_id=payload.organization_id)
    except AccessDeniedError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc

    account_service = ConnectedAccountService(db)
    oauth = GoogleOAuthService()

    def refresh_callback(refresh_token: str) -> dict[str, Any]:
        return oauth.refresh_access_token(refresh_token)

    try:
        access_token = account_service.ensure_access_token(
            account, refresh_callback=refresh_callback
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    client = GoogleBusinessClient(access_token)
    location_payload = client.get_location(payload.location_name)

    onboarding = LocationOnboardingService(db)
    location = onboarding.connect_google_location(
        organization_id=payload.organization_id,
        connected_account_id=account.id,
        location_payload=location_payload,
    )

    return location


class DisconnectAccountResponse(BaseModel):
    id: uuid.UUID
    disconnected: bool


@router.delete("/accounts/{account_id}", response_model=DisconnectAccountResponse)
def disconnect_account(
    account_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DisconnectAccountResponse:
    account = _get_connected_account(db, account_id)
    access = AccessService(db)
    try:
        access.resolve_org(user_id=current_user.id, organization_id=account.organization_id)
    except AccessDeniedError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    ConnectedAccountService(db).disconnect_google_account(account)
    return DisconnectAccountResponse(id=account.id, disconnected=True)

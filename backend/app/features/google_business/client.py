from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlencode

import httpx
from fastapi import HTTPException, status
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from backend.app.core.config import settings

logger = logging.getLogger(__name__)

GBP_REQUIRED_SCOPE = "https://www.googleapis.com/auth/business.manage"
DEFAULT_GBP_SCOPES = [GBP_REQUIRED_SCOPE]
FRONTEND_GOOGLE_CALLBACK_PATH = "/onboarding/google/callback"
GOOGLE_OAUTH_STATE_MAX_AGE_SECONDS = 15 * 60


def validate_gbp_oauth_scopes(scopes: list[str] | None) -> list[str]:
    requested = [scope.strip() for scope in scopes or [] if scope and scope.strip()]
    if not requested:
        return list(DEFAULT_GBP_SCOPES)
    unsupported = sorted(set(requested) - {GBP_REQUIRED_SCOPE})
    if unsupported:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported Google OAuth scope requested",
        )
    return list(DEFAULT_GBP_SCOPES)


def normalize_granted_gbp_scopes(scope_value: Any) -> list[str]:
    if isinstance(scope_value, str):
        granted = set(scope_value.split())
    elif isinstance(scope_value, list):
        granted = {str(scope).strip() for scope in scope_value if str(scope).strip()}
    else:
        granted = set(DEFAULT_GBP_SCOPES)
    if GBP_REQUIRED_SCOPE not in granted:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google authorization is missing the Business Profile scope",
        )
    return list(DEFAULT_GBP_SCOPES)


def validate_google_oauth_redirect_uri(redirect_uri: str | None) -> str | None:
    if not redirect_uri:
        return None
    requested = redirect_uri.strip()
    allowed = set()
    if settings.GOOGLE_OAUTH_REDIRECT_URI:
        allowed.add(str(settings.GOOGLE_OAUTH_REDIRECT_URI).rstrip("/"))
    if settings.CLIENT_APP_URL:
        allowed.add(f"{str(settings.CLIENT_APP_URL).rstrip('/')}{FRONTEND_GOOGLE_CALLBACK_PATH}")
    if requested.rstrip("/") not in allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google OAuth redirect URI is not allowed",
        )
    return requested


class OAuthStateSigner:
    def __init__(self) -> None:
        self.serializer = URLSafeTimedSerializer(
            settings.ENCRYPTION_KEY, salt="google-oauth-state"
        )

    def encode(self, payload: dict[str, Any]) -> str:
        data = dict(payload)
        data.setdefault("issued_at", datetime.now(timezone.utc).isoformat())
        return self.serializer.dumps(data)

    def decode(self, token: str) -> dict[str, Any]:
        try:
            payload = self.serializer.loads(
                token,
                max_age=GOOGLE_OAUTH_STATE_MAX_AGE_SECONDS,
            )
            if not isinstance(payload, dict):
                raise BadSignature("OAuth state payload must be an object")
            return payload
        except SignatureExpired as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="OAuth state parameter expired",
            ) from exc
        except BadSignature as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid OAuth state parameter",
            ) from exc


class GoogleOAuthService:
    AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
    TOKEN_URL = "https://oauth2.googleapis.com/token"

    def build_authorization_url(
        self,
        *,
        state: str,
        scopes: list[str],
        redirect_uri: str | None = None,
        access_type: str = "offline",
        prompt: str = "consent",
    ) -> str:
        if not settings.GOOGLE_CLIENT_ID:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="GOOGLE_CLIENT_ID is not configured",
            )
        redirect = redirect_uri or settings.GOOGLE_OAUTH_REDIRECT_URI
        if not redirect:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="GOOGLE_OAUTH_REDIRECT_URI is not configured",
            )
        scopes = validate_gbp_oauth_scopes(scopes)
        params = {
            "client_id": settings.GOOGLE_CLIENT_ID,
            "redirect_uri": redirect,
            "response_type": "code",
            "scope": " ".join(scopes),
            "access_type": access_type,
            "prompt": prompt,
            "state": state,
            "include_granted_scopes": "true",
        }
        return f"{self.AUTH_URL}?{urlencode(params)}"

    def exchange_code_for_tokens(
        self, *, code: str, redirect_uri: str | None = None
    ) -> dict[str, Any]:
        self._require_client_secret()
        redirect = redirect_uri or settings.GOOGLE_OAUTH_REDIRECT_URI
        if not redirect:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="GOOGLE_OAUTH_REDIRECT_URI is not configured",
            )
        data = {
            "code": code,
            "client_id": settings.GOOGLE_CLIENT_ID,
            "client_secret": settings.GOOGLE_CLIENT_SECRET,
            "redirect_uri": redirect,
            "grant_type": "authorization_code",
        }
        return self._post(self.TOKEN_URL, data)

    def refresh_access_token(self, refresh_token: str) -> dict[str, Any]:
        self._require_client_secret()
        data = {
            "refresh_token": refresh_token,
            "client_id": settings.GOOGLE_CLIENT_ID,
            "client_secret": settings.GOOGLE_CLIENT_SECRET,
            "grant_type": "refresh_token",
        }
        return self._post(self.TOKEN_URL, data)

    @staticmethod
    def _require_client_secret() -> None:
        if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Google OAuth client credentials are missing",
            )

    @staticmethod
    def _post(url: str, data: dict[str, Any]) -> dict[str, Any]:
        with httpx.Client(timeout=30) as client:
            response = client.post(url, data=data)
            try:
                response.raise_for_status()
            except httpx.HTTPStatusError as exc:
                logger.warning(
                    "Google OAuth request failed status=%s url=%s",
                    exc.response.status_code,
                    url,
                )
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail="Google OAuth request failed",
                ) from exc
            return response.json()


class GoogleBusinessClient:
    DEFAULT_LOCATION_READ_MASK = ",".join(
        [
            "name",
            "title",
            "storeCode",
            "storefrontAddress",
            "websiteUri",
            "categories",
            "serviceArea",
            "serviceItems",
            "regularHours",
            "specialHours",
            "metadata",
            "phoneNumbers",
            "latlng",
            "profile",
        ]
    )

    def __init__(self, access_token: str) -> None:
        self.access_token = access_token
        self.base_url = str(settings.GOOGLE_BUSINESS_API_BASE_URL).rstrip("/")
        self.account_management_base_url = str(
            settings.GOOGLE_ACCOUNT_MANAGEMENT_API_BASE_URL
        ).rstrip("/")

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json",
        }

    def _get(
        self, endpoint: str, params: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        with httpx.Client(timeout=30) as client:
            resp = client.get(endpoint, headers=self._headers(), params=params)
            self._raise_if_error(resp)
            return resp.json()

    def _post(self, endpoint: str, payload: dict[str, Any]) -> dict[str, Any]:
        with httpx.Client(timeout=30) as client:
            resp = client.post(endpoint, headers=self._headers(), json=payload)
            self._raise_if_error(resp)
            return resp.json()

    def list_accounts(self) -> list[dict[str, Any]]:
        accounts: list[dict[str, Any]] = []
        params: dict[str, Any] = {"pageSize": 20}
        while True:
            data = self._get(
                f"{self.account_management_base_url}/accounts", params=params
            )
            accounts.extend(data.get("accounts", []))
            next_page_token = data.get("nextPageToken")
            if not next_page_token:
                return accounts
            params["pageToken"] = next_page_token

    def list_locations(self, account_name: str) -> list[dict[str, Any]]:
        locations: list[dict[str, Any]] = []
        params: dict[str, Any] = {
            "pageSize": 100,
            "readMask": self.DEFAULT_LOCATION_READ_MASK,
        }
        while True:
            data = self._get(
                f"{self.base_url}/{account_name}/locations", params=params
            )
            locations.extend(data.get("locations", []))
            next_page_token = data.get("nextPageToken")
            if not next_page_token:
                return locations
            params["pageToken"] = next_page_token

    def get_location(self, location_name: str) -> dict[str, Any]:
        return self._get(
            f"{self.base_url}/{location_name}",
            params={"readMask": self.DEFAULT_LOCATION_READ_MASK},
        )

    def list_reviews(self, location_name: str) -> list[dict[str, Any]]:
        data = self._get(f"{self.base_url}/{location_name}/reviews")
        return data.get("reviews", [])

    def list_local_posts(self, location_name: str) -> list[dict[str, Any]]:
        data = self._get(f"{self.base_url}/{location_name}/localPosts")
        return data.get("localPosts", [])

    def create_local_post(self, location_name: str, payload: dict[str, Any]) -> dict[str, Any]:
        return self._post(f"{self.base_url}/{location_name}/localPosts", payload)

    def reply_to_review(self, review_name: str, comment: str) -> dict[str, Any]:
        return self._post(f"{self.base_url}/{review_name}:reply", {"comment": comment})

    def list_media(self, location_name: str) -> list[dict[str, Any]]:
        data = self._get(f"{self.base_url}/{location_name}/media")
        return data.get("mediaItems", [])

    @staticmethod
    def _raise_if_error(response: httpx.Response) -> None:
        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            logger.warning(
                "Google Business API request failed status=%s url=%s",
                exc.response.status_code,
                str(exc.request.url) if exc.request else "",
            )
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Google Business API request failed",
            ) from exc

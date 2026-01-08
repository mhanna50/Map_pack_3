from __future__ import annotations

from datetime import datetime
from typing import Any
from urllib.parse import urlencode

import httpx
from fastapi import HTTPException, status
from itsdangerous import BadSignature, URLSafeSerializer

from ..core.config import settings


class OAuthStateSigner:
    def __init__(self) -> None:
        self.serializer = URLSafeSerializer(
            settings.ENCRYPTION_KEY, salt="google-oauth-state"
        )

    def encode(self, payload: dict[str, Any]) -> str:
        return self.serializer.dumps(payload)

    def decode(self, token: str) -> dict[str, Any]:
        try:
            return self.serializer.loads(token)
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
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"Google OAuth error: {exc.response.text}",
                ) from exc
            return response.json()


class GoogleBusinessClient:
    def __init__(self, access_token: str) -> None:
        self.access_token = access_token
        self.base_url = str(settings.GOOGLE_BUSINESS_API_BASE_URL).rstrip("/")

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json",
        }

    def _get(self, endpoint: str) -> dict[str, Any]:
        with httpx.Client(timeout=30) as client:
            resp = client.get(endpoint, headers=self._headers())
            self._raise_if_error(resp)
            return resp.json()

    def _post(self, endpoint: str, payload: dict[str, Any]) -> dict[str, Any]:
        with httpx.Client(timeout=30) as client:
            resp = client.post(endpoint, headers=self._headers(), json=payload)
            self._raise_if_error(resp)
            return resp.json()

    def list_accounts(self) -> list[dict[str, Any]]:
        data = self._get(f"{self.base_url}/accounts")
        return data.get("accounts", [])

    def list_locations(self, account_name: str) -> list[dict[str, Any]]:
        data = self._get(f"{self.base_url}/{account_name}/locations")
        return data.get("locations", [])

    def get_location(self, location_name: str) -> dict[str, Any]:
        return self._get(f"{self.base_url}/{location_name}")

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
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Google Business API error: {exc.response.text}",
            ) from exc

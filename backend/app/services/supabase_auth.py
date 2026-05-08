from __future__ import annotations

import time
from typing import Any

import httpx
from jose import jwt

from backend.app.core.config import settings


class SupabaseTokenVerifier:
    def __init__(self, *, cache_ttl_seconds: int = 3600) -> None:
        if not settings.SUPABASE_URL:
            raise ValueError("SUPABASE_URL must be configured")
        base_url = settings.SUPABASE_URL.rstrip("/")
        self.jwks_url = settings.SUPABASE_JWKS_URL or f"{base_url}/auth/v1/.well-known/jwks.json"
        self.issuer = settings.SUPABASE_JWT_ISSUER or f"{base_url}/auth/v1"
        self.audience = settings.SUPABASE_JWT_AUDIENCE or "authenticated"
        self.jwt_secret = settings.SUPABASE_JWT_SECRET
        self._cache_ttl_seconds = cache_ttl_seconds
        self._jwks_keys: list[dict[str, Any]] | None = None
        self._jwks_fetched_at = 0.0

    def verify(self, token: str) -> dict[str, Any]:
        header = jwt.get_unverified_header(token)
        alg = header.get("alg")

        if alg == "HS256":
            if not self.jwt_secret:
                raise ValueError("SUPABASE_JWT_SECRET must be configured for HS256 tokens")
            return jwt.decode(
                token,
                self.jwt_secret,
                algorithms=["HS256"],
                audience=self.audience,
                issuer=self.issuer,
            )

        if alg not in {"RS256", "ES256"}:
            raise ValueError(f"Unsupported JWT alg: {alg}")

        kid = header.get("kid")
        keys = self._get_jwks()
        key = next((item for item in keys if item.get("kid") == kid), None)
        if not key:
            raise ValueError("Unable to find matching JWKS key")
        return jwt.decode(
            token,
            key,
            algorithms=[alg],
            audience=self.audience,
            issuer=self.issuer,
        )

    def _get_jwks(self) -> list[dict[str, Any]]:
        now = time.time()
        if self._jwks_keys and now - self._jwks_fetched_at < self._cache_ttl_seconds:
            return self._jwks_keys
        response = httpx.get(self.jwks_url, timeout=10)
        response.raise_for_status()
        payload = response.json()
        self._jwks_keys = payload.get("keys", [])
        self._jwks_fetched_at = now
        return self._jwks_keys

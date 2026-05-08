from __future__ import annotations

from itsdangerous import URLSafeSerializer

from backend.app.core.config import settings


class OnboardingTokenSigner:
    """Generates signed onboarding tokens embedded in invite links."""

    def __init__(self) -> None:
        secret = settings.ENCRYPTION_KEY or "temporary-key"
        self._serializer = URLSafeSerializer(secret, salt="onboarding-link")

    def create_token(self, *, org_id: str, email: str, org_name: str | None = None) -> str:
        payload = {"org_id": org_id, "email": email}
        if org_name:
            payload["org_name"] = org_name
        return self._serializer.dumps(payload)

    def decode(self, token: str) -> dict[str, str]:
        return self._serializer.loads(token)

from __future__ import annotations

import logging
from typing import Any

import httpx

from backend.app.core.config import settings

logger = logging.getLogger(__name__)


class NotificationService:
    """Email notifier that uses Supabase Auth invites for onboarding emails."""

    INVITE_PATH = "/auth/v1/invite"

    def __init__(self) -> None:
        self.base_url = settings.SUPABASE_URL.strip().rstrip("/")
        self.service_role_key = settings.SUPABASE_SERVICE_ROLE_KEY.strip()

    def send_onboarding_email(
        self,
        *,
        to_email: str,
        redirect_url: str,
        metadata: dict[str, Any] | None = None,
    ) -> bool:
        if not to_email:
            logger.warning("Attempted to send onboarding email without recipient")
            return False
        if not redirect_url:
            logger.warning("Attempted to send onboarding email to %s without redirect URL", to_email)
            return False
        if not self.base_url or not self.service_role_key:
            logger.info("Supabase auth email not configured. Invite for %s would redirect to %s", to_email, redirect_url)
            return False
        payload = {
            "email": to_email,
            "data": metadata or {},
            "redirect_to": redirect_url,
        }
        try:
            response = httpx.post(
                f"{self.base_url}{self.INVITE_PATH}",
                headers={
                    "Authorization": f"Bearer {self.service_role_key}",
                    "apikey": self.service_role_key,
                    "Content-Type": "application/json",
                },
                params={"redirect_to": redirect_url},
                json=payload,
                timeout=10,
            )
            response.raise_for_status()
        except Exception as exc:  # noqa: BLE001
            logger.exception("Failed to send Supabase invite email to %s: %s", to_email, exc)
            return False
        return True

    def send_email(
        self,
        *,
        to_email: str,
        subject: str,
        html_body: str,
        text_body: str | None = None,
    ) -> bool:
        logger.info(
            "Transactional email disabled. Subject=%s recipient=%s (Supabase Auth only supports onboarding emails).",
            subject,
            to_email,
        )
        return False

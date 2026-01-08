from __future__ import annotations

import json
import logging
from typing import Any

import httpx

from backend.app.core.config import settings

logger = logging.getLogger(__name__)


class NotificationService:
    """Simple email notifier that uses SendGrid when configured."""

    SENDGRID_ENDPOINT = "https://api.sendgrid.com/v3/mail/send"

    def __init__(self) -> None:
        self.api_key = settings.SENDGRID_API_KEY.strip()
        self.from_email = settings.EMAIL_FROM.strip()

    def send_email(self, *, to_email: str, subject: str, html_body: str, text_body: str | None = None) -> None:
        if not to_email:
            logger.warning("Attempted to send email without recipient")
            return
        if not self.api_key or not self.from_email:
            logger.info(
                "SendGrid credentials missing. Email to %s would contain subject=%s body=%s",
                to_email,
                subject,
                html_body,
            )
            return
        payload: dict[str, Any] = {
            "personalizations": [{"to": [{"email": to_email}]}],
            "from": {"email": self.from_email},
            "subject": subject,
            "content": [
                {"type": "text/plain", "value": text_body or html_body},
                {"type": "text/html", "value": html_body},
            ],
        }
        try:
            response = httpx.post(
                self.SENDGRID_ENDPOINT,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                content=json.dumps(payload),
                timeout=10,
            )
            response.raise_for_status()
        except Exception as exc:  # noqa: BLE001
            logger.exception("Failed to send onboarding email to %s: %s", to_email, exc)

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
import uuid

import httpx
import os

from sqlalchemy.orm import Session

from backend.app.models.alert import Alert
from backend.app.models.enums import AlertSeverity, AlertStatus
from backend.app.core.config import settings
try:
    from twilio.rest import Client as TwilioClient
except ImportError:  # pragma: no cover
    TwilioClient = None


class AlertService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.webhook = os.getenv("SLACK_WEBHOOK_URL")
        self.sms_recipients = [num.strip() for num in settings.ALERT_SMS_RECIPIENTS.split(",") if num.strip()]
        self.twilio_sid = settings.TWILIO_ACCOUNT_SID
        self.twilio_token = settings.TWILIO_AUTH_TOKEN
        self.twilio_from = settings.TWILIO_FROM_NUMBER

    def create_alert(
        self,
        *,
        severity: AlertSeverity,
        alert_type: str,
        message: str,
        organization_id: uuid.UUID | None = None,
        location_id: uuid.UUID | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> Alert:
        alert = Alert(
            organization_id=organization_id,
            location_id=location_id,
            severity=severity,
            alert_type=alert_type,
            message=message,
            status=AlertStatus.OPEN,
            metadata_json=metadata or {},
        )
        self.db.add(alert)
        self.db.commit()
        self.db.refresh(alert)
        self._notify(alert)
        return alert

    def list_alerts(
        self,
        *,
        status: AlertStatus | None = None,
        severity: AlertSeverity | None = None,
    ) -> list[Alert]:
        query = self.db.query(Alert)
        if status:
            query = query.filter(Alert.status == status)
        if severity:
            query = query.filter(Alert.severity == severity)
        return list(query.order_by(Alert.created_at.desc()).all())

    def acknowledge(
        self,
        alert: Alert,
        *,
        user_id: uuid.UUID | None = None,
        notes: str | None = None,
    ) -> Alert:
        if alert.status == AlertStatus.RESOLVED:
            return alert
        alert.status = AlertStatus.ACKNOWLEDGED
        alert.acknowledged_by = user_id
        alert.acknowledged_at = datetime.now(timezone.utc)
        if notes:
            alert.internal_notes = (alert.internal_notes or "") + f"\nAck: {notes}"
        self.db.add(alert)
        self.db.commit()
        self.db.refresh(alert)
        return alert

    def _notify(self, alert: Alert) -> None:
        if not self.webhook:
            return
        if alert.severity in {AlertSeverity.INFO}:
            return
        payload = {
            "text": f":rotating_light: GBP Alert [{alert.severity.value}] {alert.alert_type}\n"
            f"{alert.message}\nOrg: {alert.organization_id} Loc: {alert.location_id}"
        }
        try:
            with httpx.Client(timeout=5.0) as client:
                client.post(self.webhook, json=payload)
        except Exception:
            # silently ignore notification failures
            pass

        # SMS notifications
        if (
            self.sms_recipients
            and self.twilio_sid
            and self.twilio_token
            and self.twilio_from
            and TwilioClient is not None
            and alert.severity in {AlertSeverity.CRITICAL, AlertSeverity.WARNING}
        ):
            try:
                client = TwilioClient(self.twilio_sid, self.twilio_token)
                body = f"GBP Alert [{alert.severity.value}] {alert.alert_type}: {alert.message}"
                for to_number in self.sms_recipients:
                    client.messages.create(from_=self.twilio_from, to=to_number, body=body)
            except Exception:
                pass

    def resolve(
        self,
        alert: Alert,
        *,
        user_id: uuid.UUID | None = None,
        notes: str | None = None,
    ) -> Alert:
        alert.status = AlertStatus.RESOLVED
        alert.resolved_by = user_id
        alert.resolved_at = datetime.now(timezone.utc)
        if notes:
            alert.internal_notes = (alert.internal_notes or "") + f"\nResolved: {notes}"
        self.db.add(alert)
        self.db.commit()
        self.db.refresh(alert)
        return alert

    def notify_client(
        self,
        alert: Alert,
        *,
        user_id: uuid.UUID | None = None,
        notes: str | None = None,
    ) -> Alert:
        alert.client_notified_by = user_id
        alert.client_notified_at = datetime.now(timezone.utc)
        if notes:
            alert.internal_notes = (alert.internal_notes or "") + f"\nNotified client: {notes}"
        self.db.add(alert)
        self.db.commit()
        self.db.refresh(alert)
        return alert

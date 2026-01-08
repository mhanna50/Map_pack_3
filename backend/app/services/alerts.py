from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
import uuid

from sqlalchemy.orm import Session

from backend.app.models.alert import Alert
from backend.app.models.enums import AlertSeverity, AlertStatus


class AlertService:
    def __init__(self, db: Session) -> None:
        self.db = db

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

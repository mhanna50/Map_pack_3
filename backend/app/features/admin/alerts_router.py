from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from backend.app.api.deps import get_current_staff
from backend.app.db.session import get_db
from backend.app.models.alert import Alert
from backend.app.models.enums import AlertSeverity, AlertStatus
from backend.app.models.user import User
from backend.app.services.alerts import AlertService

router = APIRouter(prefix="/admin/alerts", tags=["admin_alerts"])


class AlertResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID | None = None
    location_id: uuid.UUID | None = None
    severity: AlertSeverity
    alert_type: str
    message: str
    status: AlertStatus
    metadata_json: dict | None = None
    created_at: datetime
    acknowledged_at: datetime | None = None
    resolved_at: datetime | None = None
    internal_notes: str | None = None


@router.get("/", response_model=list[AlertResponse])
def list_alerts(
    status_filter: AlertStatus | None = Query(None, alias="status"),
    severity: AlertSeverity | None = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_staff),
) -> list[Alert]:
    service = AlertService(db)
    return service.list_alerts(status=status_filter, severity=severity)


class AlertActionPayload(BaseModel):
    notes: str | None = None


def _get_alert(db: Session, alert_id: uuid.UUID) -> Alert:
    alert = db.get(Alert, alert_id)
    if not alert:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found")
    return alert


@router.patch("/{alert_id}/ack", response_model=AlertResponse)
def acknowledge_alert(
    alert_id: uuid.UUID,
    payload: AlertActionPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff),
) -> Alert:
    service = AlertService(db)
    alert = _get_alert(db, alert_id)
    return service.acknowledge(alert, user_id=current_user.id, notes=payload.notes)


@router.patch("/{alert_id}/resolve", response_model=AlertResponse)
def resolve_alert(
    alert_id: uuid.UUID,
    payload: AlertActionPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff),
) -> Alert:
    service = AlertService(db)
    alert = _get_alert(db, alert_id)
    return service.resolve(alert, user_id=current_user.id, notes=payload.notes)


class AlertNotifyPayload(BaseModel):
    notes: str | None = None


@router.post("/{alert_id}/notify-client", response_model=AlertResponse)
def notify_client(
    alert_id: uuid.UUID,
    payload: AlertNotifyPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff),
) -> Alert:
    service = AlertService(db)
    alert = _get_alert(db, alert_id)
    return service.notify_client(alert, user_id=current_user.id, notes=payload.notes)

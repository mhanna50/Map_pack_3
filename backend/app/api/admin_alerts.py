from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from backend.app.db.session import get_db
from backend.app.models.alert import Alert
from backend.app.models.enums import AlertSeverity, AlertStatus
from backend.app.services.access import AccessDeniedError, AccessService
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
    created_at: str
    acknowledged_at: str | None = None
    resolved_at: str | None = None
    internal_notes: str | None = None


@router.get("/", response_model=list[AlertResponse])
def list_alerts(
    user_id: uuid.UUID = Query(...),
    status_filter: AlertStatus | None = Query(None, alias="status"),
    severity: AlertSeverity | None = Query(None),
    db: Session = Depends(get_db),
) -> list[Alert]:
    access = AccessService(db)
    try:
        access.require_staff(user_id)
    except AccessDeniedError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    service = AlertService(db)
    return service.list_alerts(status=status_filter, severity=severity)


class AlertActionPayload(BaseModel):
    user_id: uuid.UUID
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
) -> Alert:
    access = AccessService(db)
    try:
        access.require_staff(payload.user_id)
    except AccessDeniedError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    service = AlertService(db)
    alert = _get_alert(db, alert_id)
    return service.acknowledge(alert, user_id=payload.user_id, notes=payload.notes)


@router.patch("/{alert_id}/resolve", response_model=AlertResponse)
def resolve_alert(
    alert_id: uuid.UUID,
    payload: AlertActionPayload,
    db: Session = Depends(get_db),
) -> Alert:
    access = AccessService(db)
    try:
        access.require_staff(payload.user_id)
    except AccessDeniedError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    service = AlertService(db)
    alert = _get_alert(db, alert_id)
    return service.resolve(alert, user_id=payload.user_id, notes=payload.notes)


class AlertNotifyPayload(BaseModel):
    user_id: uuid.UUID
    notes: str | None = None


@router.post("/{alert_id}/notify-client", response_model=AlertResponse)
def notify_client(
    alert_id: uuid.UUID,
    payload: AlertNotifyPayload,
    db: Session = Depends(get_db),
) -> Alert:
    access = AccessService(db)
    try:
        access.require_staff(payload.user_id)
    except AccessDeniedError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    service = AlertService(db)
    alert = _get_alert(db, alert_id)
    return service.notify_client(alert, user_id=payload.user_id, notes=payload.notes)

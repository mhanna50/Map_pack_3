from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.app.api.deps import get_current_user
from ..db.session import get_db
from ..services.dashboard import DashboardService
from ..services.settings import SettingsService
from ..models.alert import Alert
from ..models.enums import AlertStatus

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


class DashboardOverviewResponse(BaseModel):
    organization: dict
    location: dict | None
    role: str
    kpis: dict
    tasks: list[dict]
    available_orgs: list[dict]
    locations: list[dict]
    alerts: list[dict] | None = None
    settings: dict | None = None


@router.get("/overview", response_model=DashboardOverviewResponse)
def dashboard_overview(
    organization_id: uuid.UUID | None = Query(None),
    location_id: uuid.UUID | None = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> DashboardOverviewResponse:
    service = DashboardService(db)
    settings_service = SettingsService(db)
    try:
        data = service.get_overview(
            user_id=current_user.id,
            organization_id=organization_id,
            location_id=location_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    merged_settings = None
    if organization_id:
        merged_settings = settings_service.merged(
            organization_id,
            location_id,
        )
    alerts = _open_alerts(db, organization_id, location_id)
    return DashboardOverviewResponse(**data, settings=merged_settings, alerts=alerts)


def _open_alerts(db: Session, organization_id: uuid.UUID | None, location_id: uuid.UUID | None) -> list[dict]:
    query = db.query(Alert).filter(Alert.status != AlertStatus.RESOLVED)
    if organization_id:
        query = query.filter(Alert.organization_id == organization_id)
    if location_id:
        query = query.filter(Alert.location_id == location_id)
    return [
        {
            "id": str(alert.id),
            "type": alert.alert_type,
            "message": alert.message,
            "severity": alert.severity.value if alert.severity else None,
            "created_at": alert.created_at,
        }
        for alert in query.order_by(Alert.created_at.desc()).limit(50).all()
    ]

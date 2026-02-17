from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from backend.app.api.deps import get_current_user, require_org_member
from ..db.session import get_db
from ..models.competitor_profile import CompetitorProfile
from ..models.competitor_snapshot import CompetitorSnapshot
from ..services.competitor_monitoring import CompetitorMonitoringService
from ..services.access import AccessService

router = APIRouter(
    prefix="/competitors",
    tags=["competitors"],
    dependencies=[Depends(get_current_user), Depends(require_org_member)],
)


class ManualCompetitorItem(BaseModel):
    name: str
    google_location_id: str | None = None
    category: str | None = None
    metadata: dict | None = None


class ManualCompetitorRequest(BaseModel):
    organization_id: uuid.UUID
    competitors: list[ManualCompetitorItem]


class CompetitorResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    google_location_id: str | None = None
    category: str | None = None
    source: str
    last_monitored_at: datetime | None = None


@router.post(
    "/locations/{location_id}/manual",
    response_model=list[CompetitorResponse],
    status_code=status.HTTP_201_CREATED,
)
def add_manual_competitors(
    location_id: uuid.UUID,
    payload: ManualCompetitorRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> list[CompetitorProfile]:
    access = AccessService(db)
    try:
        access.resolve_org(user_id=current_user.id, organization_id=payload.organization_id)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    service = CompetitorMonitoringService(db)
    competitors = [
        item.model_dump() for item in payload.competitors
    ]
    try:
        return service.upsert_manual_competitors(
            organization_id=payload.organization_id,
            location_id=location_id,
            competitors=competitors,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


class DiscoverCompetitorsRequest(BaseModel):
    organization_id: uuid.UUID
    top_n: int = 5


@router.post(
    "/locations/{location_id}/discover",
    response_model=list[CompetitorResponse],
    status_code=status.HTTP_201_CREATED,
)
def discover_competitors(
    location_id: uuid.UUID,
    payload: DiscoverCompetitorsRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> list[CompetitorProfile]:
    access = AccessService(db)
    try:
        access.resolve_org(user_id=current_user.id, organization_id=payload.organization_id)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    service = CompetitorMonitoringService(db)
    try:
        return service.auto_discover_competitors(
            organization_id=payload.organization_id,
            location_id=location_id,
            top_n=payload.top_n,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/locations/{location_id}", response_model=list[CompetitorResponse])
def list_competitors(location_id: uuid.UUID, db: Session = Depends(get_db)) -> list[CompetitorProfile]:
    service = CompetitorMonitoringService(db)
    return service.list_competitors(location_id=location_id)


class MonitorCompetitorsRequest(BaseModel):
    organization_id: uuid.UUID


class MonitorCompetitorsResponse(BaseModel):
    status: str
    action_id: uuid.UUID


@router.post(
    "/locations/{location_id}/monitor",
    response_model=MonitorCompetitorsResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
def schedule_monitoring(
    location_id: uuid.UUID,
    payload: MonitorCompetitorsRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> MonitorCompetitorsResponse:
    service = CompetitorMonitoringService(db)
    action = service.schedule_monitoring(
        organization_id=payload.organization_id,
        location_id=location_id,
    )
    return MonitorCompetitorsResponse(status="scheduled", action_id=action.id)


class SnapshotResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    captured_at: datetime
    review_count: int
    average_rating: float
    review_velocity_per_week: float
    posting_frequency_per_week: float
    photo_count: int
    gap_flags: list[str] | None = None


@router.get("/locations/{location_id}/snapshots", response_model=list[SnapshotResponse])
def list_competitor_snapshots(
    location_id: uuid.UUID,
    competitor_id: uuid.UUID | None = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> list[CompetitorSnapshot]:
    service = CompetitorMonitoringService(db)
    return service.list_snapshots(location_id=location_id, competitor_id=competitor_id)

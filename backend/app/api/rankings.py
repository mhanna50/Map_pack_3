from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from ..db.session import get_db
from ..models.geo_grid_point import GeoGridPoint
from ..models.location_keyword import LocationKeyword
from ..models.rank_snapshot import RankSnapshot
from ..models.visibility_score import VisibilityScore
from ..services.rank_tracking import RankTrackingService

router = APIRouter(prefix="/rankings", tags=["rankings"])


class KeywordResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    keyword: str
    importance: int


class KeywordCreateRequest(BaseModel):
    organization_id: uuid.UUID
    location_id: uuid.UUID
    keyword: str
    importance: int = 1


@router.post("/keywords", response_model=KeywordResponse, status_code=status.HTTP_201_CREATED)
def create_keyword(
    payload: KeywordCreateRequest,
    db: Session = Depends(get_db),
) -> LocationKeyword:
    service = RankTrackingService(db)
    return service.add_keyword(
        organization_id=payload.organization_id,
        location_id=payload.location_id,
        keyword=payload.keyword,
        importance=payload.importance,
    )


class GridPointResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    latitude: float
    longitude: float
    radius_index: int
    label: str | None = None


class GridPointCreateRequest(BaseModel):
    organization_id: uuid.UUID
    location_id: uuid.UUID
    latitude: float
    longitude: float
    radius_index: int = 0
    label: str | None = None


@router.post("/grid-points", response_model=GridPointResponse, status_code=status.HTTP_201_CREATED)
def create_grid_point(
    payload: GridPointCreateRequest,
    db: Session = Depends(get_db),
) -> GeoGridPoint:
    service = RankTrackingService(db)
    return service.add_grid_point(
        organization_id=payload.organization_id,
        location_id=payload.location_id,
        latitude=payload.latitude,
        longitude=payload.longitude,
        radius_index=payload.radius_index,
        label=payload.label,
    )


class RankCheckRequest(BaseModel):
    organization_id: uuid.UUID
    location_id: uuid.UUID
    keyword_ids: list[uuid.UUID]
    grid_point_ids: list[uuid.UUID]
    run_at: datetime = Field(default_factory=lambda: datetime.now())


@router.post("/schedule", status_code=status.HTTP_202_ACCEPTED)
def schedule_rank_checks(
    payload: RankCheckRequest,
    db: Session = Depends(get_db),
) -> dict:
    service = RankTrackingService(db)
    service.schedule_rank_checks(
        organization_id=payload.organization_id,
        location_id=payload.location_id,
        keyword_ids=payload.keyword_ids,
        grid_point_ids=payload.grid_point_ids,
        run_at=payload.run_at,
    )
    return {"scheduled": True}


class SnapshotResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    keyword_id: uuid.UUID
    grid_point_id: uuid.UUID
    rank: int | None
    in_pack: bool
    checked_at: datetime


@router.get("/snapshots", response_model=list[SnapshotResponse])
def list_snapshots(
    location_id: uuid.UUID,
    db: Session = Depends(get_db),
) -> list[RankSnapshot]:
    return (
        db.query(RankSnapshot)
        .filter(RankSnapshot.location_id == location_id)
        .order_by(RankSnapshot.checked_at.desc())
        .limit(200)
        .all()
    )


class VisibilityResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    keyword_id: uuid.UUID
    score: float
    computed_at: datetime
    details: dict | None = None


@router.get("/visibility", response_model=list[VisibilityResponse])
def list_visibility_scores(
    location_id: uuid.UUID,
    db: Session = Depends(get_db),
) -> list[VisibilityScore]:
    return (
        db.query(VisibilityScore)
        .filter(VisibilityScore.location_id == location_id)
        .order_by(VisibilityScore.computed_at.desc())
        .limit(100)
        .all()
    )

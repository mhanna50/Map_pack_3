from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..db.session import get_db
from ..services.dashboard import DashboardService

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


class DashboardOverviewResponse(BaseModel):
    organization: dict
    location: dict | None
    role: str
    kpis: dict
    tasks: list[dict]
    available_orgs: list[dict]
    locations: list[dict]


@router.get("/overview", response_model=DashboardOverviewResponse)
def dashboard_overview(
    user_id: uuid.UUID = Query(...),
    organization_id: uuid.UUID | None = Query(None),
    location_id: uuid.UUID | None = Query(None),
    db: Session = Depends(get_db),
) -> DashboardOverviewResponse:
    service = DashboardService(db)
    try:
        data = service.get_overview(
            user_id=user_id,
            organization_id=organization_id,
            location_id=location_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return DashboardOverviewResponse(**data)

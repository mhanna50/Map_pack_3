from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.app.api.deps import get_current_staff
from backend.app.db.session import get_db
from backend.app.models.user import User
from backend.app.services.observability import ObservabilityService

router = APIRouter(prefix="/admin/observability", tags=["admin_observability"])


class ObservabilitySummaryResponse(BaseModel):
    jobs: dict
    publishing: dict
    token_refresh: dict
    alerts: dict
    window_hours: int = Field(default=24)


@router.get("/summary", response_model=ObservabilitySummaryResponse)
def admin_observability_summary(
    window_hours: int = Query(24, ge=1, le=168),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_staff),
) -> ObservabilitySummaryResponse:
    service = ObservabilityService(db)
    data = service.summary(window_hours=window_hours)
    return ObservabilitySummaryResponse(**data)

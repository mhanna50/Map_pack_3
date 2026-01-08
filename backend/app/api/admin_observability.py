from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.app.db.session import get_db
from backend.app.services.access import AccessDeniedError, AccessService
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
    user_id: uuid.UUID = Query(...),
    window_hours: int = Query(24, ge=1, le=168),
    db: Session = Depends(get_db),
) -> ObservabilitySummaryResponse:
    access = AccessService(db)
    try:
        access.require_staff(user_id)
    except AccessDeniedError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    service = ObservabilityService(db)
    data = service.summary(window_hours=window_hours)
    return ObservabilitySummaryResponse(**data)

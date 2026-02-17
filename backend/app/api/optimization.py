from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from ..services.access import AccessService
from backend.app.api.deps import get_current_user, require_org_member
from ..db.session import get_db
from ..models.listing_audit import ListingAudit
from ..services.listing_optimization import ListingOptimizationService

router = APIRouter(
    prefix="/optimization",
    tags=["optimization"],
    dependencies=[Depends(get_current_user), Depends(require_org_member)],
)


class AuditRequest(BaseModel):
    organization_id: uuid.UUID
    location_id: uuid.UUID
    category: str
    current_services: list[str]
    current_attributes: list[str]
    description: str
    photos_count: int
    hours_status: str


class AuditResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    missing_services: list[str] | None = None
    missing_attributes: list[str] | None = None
    description_suggestions: list[str] | None = None


@router.post("/audit", response_model=AuditResponse, status_code=status.HTTP_201_CREATED)
def run_audit(
    payload: AuditRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> ListingAudit:
    access = AccessService(db)
    try:
        access.resolve_org(user_id=current_user.id, organization_id=payload.organization_id)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    service = ListingOptimizationService(db)
    try:
        audit = service.audit_listing(
            organization_id=payload.organization_id,
            location_id=payload.location_id,
            category=payload.category,
            current_services=payload.current_services,
            current_attributes=payload.current_attributes,
            description=payload.description,
            photos_count=payload.photos_count,
            hours_status=payload.hours_status,
        )
        service.auto_apply(audit)
        return audit
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from backend.app.api.deps import get_current_user, require_org_member
from backend.app.db.session import get_db
from backend.app.models.google_business.listing_audit import ListingAudit
from backend.app.models.google_business.listing_audit_item import ListingAuditItem
from backend.app.services.auth.access import AccessService
from backend.app.services.google_business.listing_optimization import ListingOptimizationService

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
    description_suggestions: list[Any] | None = None
    profile_completeness_score: float | None = None
    status: str | None = None


class RunGbpAuditRequest(BaseModel):
    organization_id: uuid.UUID
    location_id: uuid.UUID
    trigger_source: str = "manual"
    apply_auto_fixes: bool = False


class AuditItemStatusRequest(BaseModel):
    status: str
    notes: str | None = None


class GenerateContentRequest(BaseModel):
    organization_id: uuid.UUID
    location_id: uuid.UUID
    content_type: str


@router.post("/audit", response_model=AuditResponse, status_code=status.HTTP_201_CREATED)
def run_audit(payload: AuditRequest, db: Session = Depends(get_db), current_user=Depends(get_current_user)) -> ListingAudit:
    _resolve(db, current_user.id, payload.organization_id)
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


@router.post("/gbp-audit/run", status_code=status.HTTP_201_CREATED)
def run_gbp_audit(payload: RunGbpAuditRequest, db: Session = Depends(get_db), current_user=Depends(get_current_user)) -> dict[str, Any]:
    _resolve(db, current_user.id, payload.organization_id)
    service = ListingOptimizationService(db)
    try:
        audit = service.run_full_audit(
            organization_id=payload.organization_id,
            location_id=payload.location_id,
            trigger_source=payload.trigger_source,
        )
        auto = service.apply_auto_fixes(audit_id=audit.id) if payload.apply_auto_fixes else None
        return {"audit": service.dashboard_payload(organization_id=payload.organization_id, location_id=payload.location_id)["latest"], "auto_fixes": auto}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/gbp-audit/locations/{location_id}/latest")
def latest_gbp_audit(
    location_id: uuid.UUID,
    organization_id: uuid.UUID = Query(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> dict[str, Any]:
    _resolve(db, current_user.id, organization_id)
    return ListingOptimizationService(db).dashboard_payload(organization_id=organization_id, location_id=location_id)


@router.get("/gbp-audit/locations/{location_id}/history")
def gbp_audit_history(
    location_id: uuid.UUID,
    organization_id: uuid.UUID = Query(...),
    limit: int = Query(12, ge=1, le=36),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> list[dict[str, Any]]:
    _resolve(db, current_user.id, organization_id)
    service = ListingOptimizationService(db)
    return [service._audit_dict(row) for row in service.history(organization_id=organization_id, location_id=location_id, limit=limit)]


@router.patch("/gbp-audit/items/{item_id}")
def update_gbp_audit_item(
    item_id: uuid.UUID,
    payload: AuditItemStatusRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> dict[str, Any]:
    item = db.get(ListingAuditItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Audit item not found")
    _resolve(db, current_user.id, item.organization_id)
    try:
        updated = ListingOptimizationService(db).update_item_status(item_id=item_id, status=payload.status, notes=payload.notes)
        return ListingOptimizationService._item_dict(updated)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/gbp-audit/{audit_id}/apply-auto-fixes")
def apply_gbp_audit_auto_fixes(
    audit_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> dict[str, Any]:
    audit = db.get(ListingAudit, audit_id)
    if not audit:
        raise HTTPException(status_code=404, detail="Audit not found")
    _resolve(db, current_user.id, audit.organization_id)
    try:
        return ListingOptimizationService(db).apply_auto_fixes(audit_id=audit_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/gbp-audit/generate-content")
def generate_gbp_audit_content(
    payload: GenerateContentRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> dict[str, Any]:
    _resolve(db, current_user.id, payload.organization_id)
    try:
        return ListingOptimizationService(db).generate_content(
            organization_id=payload.organization_id,
            location_id=payload.location_id,
            content_type=payload.content_type,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/gbp-audit/schedule-monthly")
def schedule_monthly_gbp_audits(db: Session = Depends(get_db), current_user=Depends(get_current_user)) -> dict[str, int]:
    _ = current_user
    return {"scheduled": ListingOptimizationService(db).schedule_monthly_audits()}


def _resolve(db: Session, user_id: uuid.UUID, organization_id: uuid.UUID) -> None:
    try:
        AccessService(db).resolve_org(user_id=user_id, organization_id=organization_id)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc

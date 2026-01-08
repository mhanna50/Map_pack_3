from __future__ import annotations

from datetime import datetime
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from backend.app.db.session import get_db
from backend.app.models.audit_log import AuditLog
from backend.app.services.access import AccessDeniedError, AccessService

router = APIRouter(prefix="/admin/audit", tags=["admin_audit"])


class AuditEntryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID | None = None
    location_id: uuid.UUID | None = None
    actor_user_id: uuid.UUID | None = None
    action: str
    entity_type: str | None = None
    entity_id: str | None = None
    before_json: dict | None = None
    after_json: dict | None = None
    metadata_json: dict | None = None
    created_at: datetime


@router.get("/", response_model=list[AuditEntryResponse])
def list_audit_entries(
    user_id: uuid.UUID = Query(...),
    organization_id: uuid.UUID | None = Query(None),
    actor_id: uuid.UUID | None = Query(None),
    action: str | None = Query(None),
    start: datetime | None = Query(None),
    end: datetime | None = Query(None),
    limit: int = Query(200, ge=1, le=1000),
    db: Session = Depends(get_db),
) -> list[AuditLog]:
    access = AccessService(db)
    try:
        access.require_staff(user_id)
    except AccessDeniedError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    query = db.query(AuditLog)
    if organization_id:
        query = query.filter(AuditLog.organization_id == organization_id)
    if actor_id:
        query = query.filter(AuditLog.actor_user_id == actor_id)
    if action:
        query = query.filter(AuditLog.action == action)
    if start:
        query = query.filter(AuditLog.created_at >= start)
    if end:
        query = query.filter(AuditLog.created_at <= end)
    entries = (
        query.order_by(AuditLog.created_at.desc())
        .limit(limit)
        .all()
    )
    return entries

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from backend.app.db.session import get_db
from backend.app.models.approval_request import ApprovalRequest
from backend.app.models.enums import ApprovalCategory, ApprovalStatus
from backend.app.services.access import AccessDeniedError, AccessService
from backend.app.services.approvals import ApprovalService

router = APIRouter(prefix="/admin/approvals", tags=["admin_approvals"])


class AdminApprovalResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    location_id: uuid.UUID | None = None
    category: ApprovalCategory
    status: ApprovalStatus
    reason: str
    severity: str
    payload: dict | None = None
    before_state: dict | None = None
    source_json: dict | None = None
    proposal_json: dict | None = None
    approved_content: str | None = None
    resolved_by: uuid.UUID | None = None
    resolved_at: datetime | None = None
    resolution_notes: str | None = None
    published_external_id: str | None = None
    published_at: datetime | None = None
    created_at: datetime


@router.get("/", response_model=list[AdminApprovalResponse])
def admin_list_approvals(
    user_id: uuid.UUID = Query(...),
    status_filter: ApprovalStatus | None = Query(None, alias="status"),
    organization_id: uuid.UUID | None = Query(None),
    location_id: uuid.UUID | None = Query(None),
    category: ApprovalCategory | None = Query(None),
    severity: str | None = Query(None),
    older_than_hours: int | None = Query(None, ge=0),
    db: Session = Depends(get_db),
) -> list[ApprovalRequest]:
    access = AccessService(db)
    try:
        access.require_staff(user_id)
    except AccessDeniedError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    query = db.query(ApprovalRequest)
    if status_filter:
        query = query.filter(ApprovalRequest.status == status_filter)
    if organization_id:
        query = query.filter(ApprovalRequest.organization_id == organization_id)
    if location_id:
        query = query.filter(ApprovalRequest.location_id == location_id)
    if category:
        query = query.filter(ApprovalRequest.category == category)
    if severity:
        query = query.filter(ApprovalRequest.severity == severity)
    if older_than_hours:
        cutoff = datetime.now(timezone.utc) - timedelta(hours=older_than_hours)
        query = query.filter(ApprovalRequest.created_at <= cutoff)
    return list(query.order_by(ApprovalRequest.created_at.asc()).all())


class AdminApprovalUpdateRequest(BaseModel):
    action: Literal["approve", "reject"]
    user_id: uuid.UUID
    notes: str | None = None
    content: str | None = None


@router.patch("/{approval_id}", response_model=AdminApprovalResponse)
def admin_update_approval(
    approval_id: uuid.UUID,
    payload: AdminApprovalUpdateRequest,
    db: Session = Depends(get_db),
) -> ApprovalRequest:
    access = AccessService(db)
    try:
        access.require_staff(payload.user_id)
    except AccessDeniedError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    service = ApprovalService(db)
    request = db.get(ApprovalRequest, approval_id)
    if not request:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Approval not found")
    if payload.action == "approve":
        return service.approve(
            request,
            approved_by=payload.user_id,
            notes=payload.notes,
            content=payload.content,
        )
    return service.reject(
        request,
        rejected_by=payload.user_id,
        notes=payload.notes,
    )


class AdminPublishRequest(BaseModel):
    user_id: uuid.UUID
    external_id: str | None = None
    content: str | None = None


@router.post("/{approval_id}/publish", response_model=AdminApprovalResponse)
def admin_publish_approval(
    approval_id: uuid.UUID,
    payload: AdminPublishRequest,
    db: Session = Depends(get_db),
) -> ApprovalRequest:
    access = AccessService(db)
    try:
        access.require_staff(payload.user_id)
    except AccessDeniedError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    service = ApprovalService(db)
    request = db.get(ApprovalRequest, approval_id)
    if not request:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Approval not found")
    try:
        return service.publish(
            request,
            actor_user_id=payload.user_id,
            external_id=payload.external_id,
            content=payload.content,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

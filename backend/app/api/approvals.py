from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from ..db.session import get_db
from ..models.approval_request import ApprovalRequest
from ..models.enums import ApprovalCategory, ApprovalStatus
from ..services.approvals import ApprovalService

router = APIRouter(prefix="/approvals", tags=["approvals"])


class ApprovalResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    location_id: uuid.UUID | None = None
    category: ApprovalCategory
    status: ApprovalStatus
    reason: str
    payload: dict | None = None
    before_state: dict | None = None
    resolved_by: uuid.UUID | None = None
    resolved_at: datetime | None = None
    resolution_notes: str | None = None


class ApprovalCreateRequest(BaseModel):
    organization_id: uuid.UUID
    location_id: uuid.UUID | None = None
    category: ApprovalCategory
    reason: str
    payload: dict | None = None
    before_state: dict | None = None
    requested_by: uuid.UUID | None = None


@router.post("/", response_model=ApprovalResponse, status_code=status.HTTP_201_CREATED)
def create_approval(payload: ApprovalCreateRequest, db: Session = Depends(get_db)) -> ApprovalRequest:
    service = ApprovalService(db)
    return service.create_request(
        organization_id=payload.organization_id,
        location_id=payload.location_id,
        category=payload.category,
        reason=payload.reason,
        payload=payload.payload,
        before_state=payload.before_state,
        requested_by=payload.requested_by,
    )


@router.get("/", response_model=list[ApprovalResponse])
def list_approvals(
    organization_id: uuid.UUID | None = Query(None),
    location_id: uuid.UUID | None = Query(None),
    status_filter: ApprovalStatus | None = Query(None, alias="status"),
    db: Session = Depends(get_db),
) -> list[ApprovalRequest]:
    service = ApprovalService(db)
    return service.list_requests(
        organization_id=organization_id,
        location_id=location_id,
        status=status_filter,
    )


class ApprovalActionRequest(BaseModel):
    user_id: uuid.UUID | None = None
    notes: str | None = None


def _get_request(db: Session, approval_id: uuid.UUID) -> ApprovalRequest:
    request = db.get(ApprovalRequest, approval_id)
    if not request:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Approval not found")
    return request


@router.post("/{approval_id}/approve", response_model=ApprovalResponse)
def approve_request(
    approval_id: uuid.UUID,
    payload: ApprovalActionRequest,
    db: Session = Depends(get_db),
) -> ApprovalRequest:
    service = ApprovalService(db)
    request = _get_request(db, approval_id)
    return service.approve(request, approved_by=payload.user_id, notes=payload.notes)


@router.post("/{approval_id}/reject", response_model=ApprovalResponse)
def reject_request(
    approval_id: uuid.UUID,
    payload: ApprovalActionRequest,
    db: Session = Depends(get_db),
) -> ApprovalRequest:
    service = ApprovalService(db)
    request = _get_request(db, approval_id)
    return service.reject(request, rejected_by=payload.user_id, notes=payload.notes)


@router.post("/{approval_id}/rollback", response_model=ApprovalResponse)
def rollback_request(
    approval_id: uuid.UUID,
    payload: ApprovalActionRequest,
    db: Session = Depends(get_db),
) -> ApprovalRequest:
    service = ApprovalService(db)
    request = _get_request(db, approval_id)
    return service.rollback(request, initiated_by=payload.user_id, notes=payload.notes)

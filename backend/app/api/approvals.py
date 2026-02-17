from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from backend.app.api.deps import get_current_user, require_org_member
from ..db.session import get_db
from ..models.approval_request import ApprovalRequest
from ..models.enums import ApprovalCategory, ApprovalStatus
from ..services.approvals import ApprovalService
from ..services.access import AccessService

router = APIRouter(
    prefix="/approvals",
    tags=["approvals"],
    dependencies=[Depends(get_current_user), Depends(require_org_member)],
)


class ApprovalResponse(BaseModel):
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


class ApprovalCreateRequest(BaseModel):
    organization_id: uuid.UUID
    location_id: uuid.UUID | None = None
    category: ApprovalCategory
    reason: str
    severity: str | None = None
    payload: dict | None = None
    before_state: dict | None = None
    source_json: dict | None = None
    proposal_json: dict | None = None
    requested_by: uuid.UUID | None = None


@router.post("/", response_model=ApprovalResponse, status_code=status.HTTP_201_CREATED)
def create_approval(
    payload: ApprovalCreateRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> ApprovalRequest:
    access = AccessService(db)
    try:
        access.resolve_org(user_id=current_user.id, organization_id=payload.organization_id)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    service = ApprovalService(db)
    try:
        return service.create_request(
            organization_id=payload.organization_id,
            location_id=payload.location_id,
            category=payload.category,
            reason=payload.reason,
            payload=payload.payload,
            before_state=payload.before_state,
            severity=payload.severity,
            source=payload.source_json,
            proposal=payload.proposal_json,
            requested_by=payload.requested_by,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


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
    content: str | None = None


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
    current_user=Depends(get_current_user),
) -> ApprovalRequest:
    service = ApprovalService(db)
    request = _get_request(db, approval_id)
    AccessService(db).resolve_org(user_id=current_user.id, organization_id=request.organization_id)
    return service.approve(
        request,
        approved_by=payload.user_id,
        notes=payload.notes,
        content=payload.content,
    )


@router.post("/{approval_id}/reject", response_model=ApprovalResponse)
def reject_request(
    approval_id: uuid.UUID,
    payload: ApprovalActionRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> ApprovalRequest:
    service = ApprovalService(db)
    request = _get_request(db, approval_id)
    AccessService(db).resolve_org(user_id=current_user.id, organization_id=request.organization_id)
    return service.reject(request, rejected_by=payload.user_id, notes=payload.notes)


@router.post("/{approval_id}/rollback", response_model=ApprovalResponse)
def rollback_request(
    approval_id: uuid.UUID,
    payload: ApprovalActionRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> ApprovalRequest:
    service = ApprovalService(db)
    request = _get_request(db, approval_id)
    AccessService(db).resolve_org(user_id=current_user.id, organization_id=request.organization_id)
    return service.rollback(request, initiated_by=payload.user_id, notes=payload.notes)

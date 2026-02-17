from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from backend.app.api.deps import get_current_user, require_org_member
from ..db.session import get_db
from ..models.enums import QnaStatus
from ..models.qna_entry import QnaEntry
from ..services.qna import QnaService
from ..services.access import AccessService

router = APIRouter(
    prefix="/qna",
    tags=["qna"],
    dependencies=[Depends(get_current_user), Depends(require_org_member)],
)


class QnaResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    location_id: uuid.UUID
    question: str
    answer: str
    status: QnaStatus
    scheduled_at: datetime | None = None
    posted_at: datetime | None = None


class QnaCreateRequest(BaseModel):
    organization_id: uuid.UUID
    location_id: uuid.UUID
    connected_account_id: uuid.UUID | None = None
    categories: list[str] = Field(default_factory=list)
    services: list[str] = Field(default_factory=list)
    cities: list[str] = Field(default_factory=list)
    competitor_names: list[str] | None = None
    scheduled_at: datetime | None = None


@router.post("/", response_model=QnaResponse, status_code=status.HTTP_201_CREATED)
def generate_qna(
    payload: QnaCreateRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> QnaEntry:
    access = AccessService(db)
    try:
        access.resolve_org(user_id=current_user.id, organization_id=payload.organization_id)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    service = QnaService(db)
    try:
        return service.generate_qna(
            organization_id=payload.organization_id,
            location_id=payload.location_id,
            connected_account_id=payload.connected_account_id,
            categories=payload.categories,
            services=payload.services,
            cities=payload.cities,
            competitor_names=payload.competitor_names,
            scheduled_at=payload.scheduled_at,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/", response_model=list[QnaResponse])
def list_qna(
    organization_id: uuid.UUID | None = None,
    location_id: uuid.UUID | None = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> list[QnaEntry]:
    query = db.query(QnaEntry)
    if organization_id:
        query = query.filter(QnaEntry.organization_id == organization_id)
    if location_id:
        query = query.filter(QnaEntry.location_id == location_id)
    return query.order_by(QnaEntry.scheduled_at.desc().nullslast()).limit(100).all()


class QnaStatusRequest(BaseModel):
    status: QnaStatus


@router.put("/{qna_id}/status", response_model=QnaResponse)
def update_qna_status(
    qna_id: uuid.UUID,
    payload: QnaStatusRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> QnaEntry:
    qna = db.get(QnaEntry, qna_id)
    if not qna:
        raise HTTPException(status_code=404, detail="Q&A not found")
    AccessService(db).resolve_org(user_id=current_user.id, organization_id=qna.organization_id)
    # ensure membership in owning org and consistent scope
    service = QnaService(db)
    service.validate_scope(
        organization_id=qna.organization_id,
        location_id=qna.location_id,
        connected_account_id=qna.connected_account_id,
    )
    qna.status = payload.status
    db.add(qna)
    db.commit()
    db.refresh(qna)
    return qna

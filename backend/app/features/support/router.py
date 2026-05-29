from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.app.api.deps import get_current_user
from backend.app.db.session import get_db
from backend.app.models.identity.user import User
from backend.app.models.support.ticket import SupportTicket
from backend.app.services.auth.access import AccessDeniedError, AccessService

router = APIRouter(prefix="/support", tags=["support"], dependencies=[Depends(get_current_user)])


class SupportTicketCreate(BaseModel):
    organization_id: uuid.UUID
    subject: str = Field(..., min_length=3, max_length=255)
    description: str = Field(..., min_length=3, max_length=4000)


class SupportTicketResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    subject: str
    description: str | None = None
    status: str
    created_at: datetime
    updated_at: datetime


@router.get("/tickets", response_model=list[SupportTicketResponse])
def list_support_tickets(
    organization_id: uuid.UUID = Query(...),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[SupportTicket]:
    _resolve_tenant(db, current_user.id, organization_id)
    return (
        db.query(SupportTicket)
        .filter(SupportTicket.tenant_id == organization_id)
        .order_by(SupportTicket.created_at.desc())
        .limit(limit)
        .all()
    )


@router.post("/tickets", response_model=SupportTicketResponse, status_code=status.HTTP_201_CREATED)
def create_support_ticket(
    payload: SupportTicketCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SupportTicket:
    _resolve_tenant(db, current_user.id, payload.organization_id)
    ticket = SupportTicket(
        tenant_id=payload.organization_id,
        subject=payload.subject.strip(),
        description=payload.description.strip(),
        status="open",
    )
    db.add(ticket)
    db.commit()
    db.refresh(ticket)
    return ticket


def _resolve_tenant(db: Session, user_id: uuid.UUID, organization_id: uuid.UUID) -> None:
    try:
        AccessService(db).resolve_org(user_id=user_id, organization_id=organization_id)
    except AccessDeniedError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    if db.bind and db.bind.dialect.name == "postgresql":
        db.execute(text("SET LOCAL app.current_org = :org_id"), {"org_id": str(organization_id)})

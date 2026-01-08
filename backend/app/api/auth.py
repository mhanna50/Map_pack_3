from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.app.db.session import get_db
from backend.app.models.membership import Membership
from backend.app.models.enums import MembershipRole
from backend.app.services.invites import InviteService

router = APIRouter(prefix="/auth", tags=["auth"])


class AcceptInviteRequest(BaseModel):
    token: str
    full_name: str | None = None
    password: str


class AcceptInviteResponse(BaseModel):
    organization_id: uuid.UUID
    user_id: uuid.UUID
    role: MembershipRole


@router.post(
    "/accept-invite",
    response_model=AcceptInviteResponse,
    status_code=status.HTTP_200_OK,
)
def accept_invite(
    payload: AcceptInviteRequest,
    db: Session = Depends(get_db),
) -> AcceptInviteResponse:
    service = InviteService(db)
    try:
        invite, user = service.accept_invite(
            token=payload.token,
            full_name=payload.full_name,
            password=payload.password,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    membership = (
        db.query(Membership)
        .filter(
            Membership.user_id == user.id,
            Membership.organization_id == invite.organization_id,
        )
        .first()
    )
    role = membership.role if membership else invite.role
    return AcceptInviteResponse(
        organization_id=invite.organization_id,
        user_id=user.id,
        role=role,
    )

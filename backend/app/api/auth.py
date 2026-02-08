from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.app.api.deps import get_current_user
from backend.app.db.session import get_db
from backend.app.models.membership import Membership
from backend.app.models.enums import MembershipRole
from backend.app.models.user import User
from backend.app.services.invites import InviteService
from backend.app.services.access import AccessService

router = APIRouter(prefix="/auth", tags=["auth"])


class CurrentUserResponse(BaseModel):
    id: uuid.UUID
    email: str
    is_staff: bool
    organization_ids: list[uuid.UUID]


@router.get("/me", response_model=CurrentUserResponse)
def current_user_profile(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CurrentUserResponse:
    access = AccessService(db)
    orgs = access.member_orgs(current_user.id)
    return CurrentUserResponse(
        id=current_user.id,
        email=current_user.email,
        is_staff=current_user.is_staff,
        organization_ids=[org.id for org in orgs],
    )


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

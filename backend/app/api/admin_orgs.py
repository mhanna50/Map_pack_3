from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from sqlalchemy.orm import Session

from backend.app.api.deps import get_current_staff
from backend.app.api.orgs import LocationResponse
from backend.app.db.session import get_db
from backend.app.models.alert import Alert
from backend.app.models.enums import AlertStatus, MembershipRole, OrganizationType
from backend.app.models.invite import OrganizationInvite
from backend.app.models.location import Location
from backend.app.models.organization import Organization
from backend.app.models.user import User
from backend.app.services.audit import log_audit
from backend.app.services.impersonation import ImpersonationService
from backend.app.services.invites import InviteService

router = APIRouter(prefix="/admin/orgs", tags=["admin_orgs"])


class AdminOrganizationCreateRequest(BaseModel):
    name: str
    org_type: OrganizationType = OrganizationType.BUSINESS
    plan_tier: str = Field(default="starter", max_length=64)
    slug: str | None = Field(default=None, pattern=r"^[a-z0-9-]{1,64}$")
    metadata: dict | None = None
    usage_limits: dict | None = None


class AdminOrganizationSummary(BaseModel):
    id: uuid.UUID
    name: str
    plan_tier: str | None
    status: str
    locations_count: int
    needs_attention: bool
    posting_paused: bool
    posting_cap_per_week: int | None = None


class AdminMemberResponse(BaseModel):
    membership_id: uuid.UUID
    user_id: uuid.UUID
    email: EmailStr
    full_name: str | None = None
    role: MembershipRole


class AdminLocationResponse(LocationResponse):
    posting_paused: bool
    posting_cap_per_week: int | None = None


class AdminInviteResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: EmailStr
    role: MembershipRole
    expires_at: datetime
    accepted_at: datetime | None = None
    token: str | None = None


class AdminPostingControlRequest(BaseModel):
    paused: bool | None = None
    cap_per_week: int | None = Field(default=None, ge=0, le=50)


class AdminPostingControlResponse(BaseModel):
    paused: bool
    cap_per_week: int | None = None


class AdminOrganizationDetailResponse(BaseModel):
    id: uuid.UUID
    name: str
    plan_tier: str | None
    org_type: OrganizationType
    slug: str | None = None
    created_at: datetime | None = None
    locations: list[AdminLocationResponse]
    members: list[AdminMemberResponse]
    invites: list[AdminInviteResponse]
    posting_paused: bool
    posting_cap_per_week: int | None = None


@router.post("/", response_model=AdminOrganizationSummary, status_code=status.HTTP_201_CREATED)
def admin_create_org(
    payload: AdminOrganizationCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff),
) -> AdminOrganizationSummary:
    organization = Organization(
        name=payload.name,
        org_type=payload.org_type,
        plan_tier=payload.plan_tier,
        slug=payload.slug,
        metadata_json=payload.metadata or {},
        usage_limits_json=payload.usage_limits or {},
    )
    db.add(organization)
    db.commit()
    db.refresh(organization)
    log_audit(
        db,
        action="organization.created",
        actor=current_user.id,
        org_id=organization.id,
        entity="organization",
        entity_id=str(organization.id),
        after={"name": organization.name, "plan": organization.plan_tier},
    )
    return _org_summary(db, organization)


@router.get("/", response_model=list[AdminOrganizationSummary])
def admin_list_orgs(
    search: str | None = Query(None),
    plan: str | None = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_staff),
) -> list[AdminOrganizationSummary]:
    query = db.query(Organization)
    if search:
        search_term = f"%{search.lower()}%"
        query = query.filter(Organization.name.ilike(search_term))
    if plan:
        query = query.filter(Organization.plan_tier == plan)
    organizations = query.order_by(Organization.created_at.desc()).all()
    return [_org_summary(db, org) for org in organizations]


@router.get(
    "/{organization_id}",
    response_model=AdminOrganizationDetailResponse,
)
def admin_org_detail(
    organization_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_staff),
) -> AdminOrganizationDetailResponse:
    organization = db.get(Organization, organization_id)
    if not organization:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    locations = [
        AdminLocationResponse.model_validate(location)
        for location in sorted(organization.locations, key=lambda loc: loc.created_at or datetime.min)
    ]
    members = [
        AdminMemberResponse(
            membership_id=membership.id,
            user_id=membership.user_id,
            email=membership.user.email,
            full_name=membership.user.full_name,
            role=membership.role,
        )
        for membership in organization.memberships
    ]
    invites = _pending_invites(db, organization_id)
    return AdminOrganizationDetailResponse(
        id=organization.id,
        name=organization.name,
        plan_tier=organization.plan_tier,
        org_type=organization.org_type,
        slug=organization.slug,
        created_at=organization.created_at,
        locations=locations,
        members=members,
        invites=invites,
        posting_paused=organization.posting_paused,
        posting_cap_per_week=organization.posting_cap_per_week,
    )


@router.patch(
    "/{organization_id}/posting",
    response_model=AdminPostingControlResponse,
)
def admin_update_org_posting_controls(
    organization_id: uuid.UUID,
    payload: AdminPostingControlRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff),
) -> AdminPostingControlResponse:
    organization = db.get(Organization, organization_id)
    if not organization:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    data = payload.model_dump(exclude_unset=True)
    changed = False
    before = {
        "posting_paused": organization.posting_paused,
        "posting_cap_per_week": organization.posting_cap_per_week,
    }
    if "paused" in data and data["paused"] is not None:
        organization.posting_paused = data["paused"]
        changed = True
    if "cap_per_week" in data:
        organization.posting_cap_per_week = data["cap_per_week"]
        changed = True
    db.add(organization)
    db.commit()
    db.refresh(organization)
    if changed:
        log_audit(
            db,
            action="organization.posting_controls_updated",
            actor=current_user.id,
            org_id=organization.id,
            entity="organization",
            entity_id=str(organization.id),
            before=before,
            after={
                "posting_paused": organization.posting_paused,
                "posting_cap_per_week": organization.posting_cap_per_week,
            },
        )
    return AdminPostingControlResponse(
        paused=organization.posting_paused,
        cap_per_week=organization.posting_cap_per_week,
    )


@router.patch(
    "/{organization_id}/locations/{location_id}/posting",
    response_model=AdminPostingControlResponse,
)
def admin_update_location_posting_controls(
    organization_id: uuid.UUID,
    location_id: uuid.UUID,
    payload: AdminPostingControlRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff),
) -> AdminPostingControlResponse:
    location = db.get(Location, location_id)
    if not location or location.organization_id != organization_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Location not found")
    data = payload.model_dump(exclude_unset=True)
    changed = False
    before = {
        "posting_paused": location.posting_paused,
        "posting_cap_per_week": location.posting_cap_per_week,
    }
    if "paused" in data and data["paused"] is not None:
        location.posting_paused = data["paused"]
        changed = True
    if "cap_per_week" in data:
        location.posting_cap_per_week = data["cap_per_week"]
        changed = True
    db.add(location)
    db.commit()
    db.refresh(location)
    if changed:
        log_audit(
            db,
            action="location.posting_controls_updated",
            actor=current_user.id,
            org_id=organization_id,
            entity="location",
            entity_id=str(location.id),
            before=before,
            after={
                "posting_paused": location.posting_paused,
                "posting_cap_per_week": location.posting_cap_per_week,
            },
        )
    return AdminPostingControlResponse(
        paused=location.posting_paused,
        cap_per_week=location.posting_cap_per_week,
    )


class AdminInviteRequest(BaseModel):
    email: EmailStr
    role: MembershipRole = MembershipRole.MEMBER
    expires_in_days: int = 14


@router.post(
    "/{organization_id}/invites",
    response_model=AdminInviteResponse,
    status_code=status.HTTP_201_CREATED,
)
def admin_create_invite(
    organization_id: uuid.UUID,
    payload: AdminInviteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff),
) -> AdminInviteResponse:
    service = InviteService(db)
    try:
        invite, token = service.create_invite(
            organization_id=organization_id,
            email=payload.email,
            role=payload.role,
            invited_by=current_user.id,
            expires_in_days=payload.expires_in_days,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    response = AdminInviteResponse.model_validate(invite)
    response.token = token
    return response


class ImpersonateRequest(BaseModel):
    reason: str | None = None


class ImpersonateResponse(BaseModel):
    token: str
    expires_at: datetime


@router.post(
    "/{organization_id}/impersonate",
    response_model=ImpersonateResponse,
    status_code=status.HTTP_201_CREATED,
)
def impersonate_org(
    organization_id: uuid.UUID,
    payload: ImpersonateRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff),
) -> ImpersonateResponse:
    ip_addr = request.client.host if request.client else None
    service = ImpersonationService(db)
    session, token = service.start_session(
        admin_user_id=current_user.id,
        organization_id=organization_id,
        reason=payload.reason,
        ip_address=ip_addr,
    )
    return ImpersonateResponse(token=token, expires_at=session.expires_at)


def _org_summary(db: Session, organization: Organization) -> AdminOrganizationSummary:
    locations_count = len(organization.locations)
    status_value = "active" if locations_count else "pending"
    unresolved_alerts = (
        db.query(Alert)
        .filter(Alert.organization_id == organization.id)
        .filter(Alert.status != AlertStatus.RESOLVED)
        .count()
    )
    return AdminOrganizationSummary(
        id=organization.id,
        name=organization.name,
        plan_tier=organization.plan_tier,
        status=status_value,
        locations_count=locations_count,
        needs_attention=unresolved_alerts > 0,
        posting_paused=organization.posting_paused,
        posting_cap_per_week=organization.posting_cap_per_week,
    )


def _pending_invites(db: Session, organization_id: uuid.UUID) -> list[AdminInviteResponse]:
    invites = (
        db.query(OrganizationInvite)
        .filter(OrganizationInvite.organization_id == organization_id)
        .order_by(OrganizationInvite.created_at.desc())
        .all()
    )
    return [AdminInviteResponse.model_validate(invite) for invite in invites]

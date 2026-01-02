from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, ConfigDict
from sqlalchemy.orm import Session

from ..db.session import get_db
from ..models.enums import LocationStatus, OrganizationType
from ..models.location import Location
from ..models.location_settings import LocationSettings
from ..models.organization import Organization

router = APIRouter(prefix="/orgs", tags=["organizations"])


class OrganizationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    org_type: OrganizationType
    slug: str | None = None


class OrganizationCreateRequest(BaseModel):
    name: str
    org_type: OrganizationType = OrganizationType.AGENCY
    slug: str | None = Field(default=None, pattern=r"^[a-z0-9-]{1,64}$")


@router.post("/", response_model=OrganizationResponse, status_code=status.HTTP_201_CREATED)
def create_organization(
    payload: OrganizationCreateRequest, db: Session = Depends(get_db)
) -> Organization:
    org = Organization(name=payload.name, org_type=payload.org_type, slug=payload.slug)
    db.add(org)
    db.commit()
    db.refresh(org)
    return org


@router.get("/", response_model=list[OrganizationResponse])
def list_organizations(db: Session = Depends(get_db)) -> list[Organization]:
    return db.query(Organization).order_by(Organization.created_at.desc()).all()


class LocationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    name: str
    timezone: str
    status: LocationStatus
    google_location_id: str | None = None


class LocationSettingsPayload(BaseModel):
    posting_schedule: dict | None = None
    voice_profile: dict | None = None
    approvals: dict | None = None
    services: list[str] | None = None
    keywords: list[str] | None = None
    competitors: list[str] | None = None


class LocationCreateRequest(BaseModel):
    name: str
    timezone: str = "UTC"
    google_location_id: str | None = None
    settings: LocationSettingsPayload | None = None


@router.post(
    "/{organization_id}/locations",
    response_model=LocationResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_location(
    organization_id: uuid.UUID,
    payload: LocationCreateRequest,
    db: Session = Depends(get_db),
) -> Location:
    organization = db.get(Organization, organization_id)
    if not organization:
        raise HTTPException(status_code=404, detail="Organization not found")

    location = Location(
        organization_id=organization_id,
        name=payload.name,
        timezone=payload.timezone,
        google_location_id=payload.google_location_id,
    )
    db.add(location)
    db.flush()

    if payload.settings:
        settings = LocationSettings(
            location_id=location.id,
            **payload.settings.model_dump(exclude_unset=True),
        )
        db.add(settings)

    db.commit()
    db.refresh(location)
    return location


@router.get("/{organization_id}/locations", response_model=list[LocationResponse])
def list_locations(
    organization_id: uuid.UUID, db: Session = Depends(get_db)
) -> list[Location]:
    return (
        db.query(Location)
        .filter(Location.organization_id == organization_id)
        .order_by(Location.created_at.desc())
        .all()
    )


class LocationSettingsRequest(LocationSettingsPayload):
    pass


@router.put("/locations/{location_id}/settings", response_model=LocationResponse)
def update_location_settings(
    location_id: uuid.UUID,
    payload: LocationSettingsRequest,
    db: Session = Depends(get_db),
) -> Location:
    location = db.get(Location, location_id)
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")

    if location.settings:
        for key, value in payload.model_dump(exclude_unset=True).items():
            setattr(location.settings, key, value)
    else:
        settings = LocationSettings(
            location_id=location_id, **payload.model_dump(exclude_unset=True)
        )
        db.add(settings)

    db.commit()
    db.refresh(location)
    return location

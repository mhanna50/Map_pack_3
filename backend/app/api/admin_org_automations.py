from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from backend.app.api.deps import get_current_staff
from backend.app.db.session import get_db
from backend.app.models.user import User
from backend.app.services.automation_settings import (
    AUTOMATION_DEFINITIONS,
    AutomationSettingsService,
)
from backend.app.services.jobs import JobService

router = APIRouter(prefix="/admin/orgs", tags=["admin_automations"])


class AutomationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    type: str
    label: str
    enabled: bool
    config: dict
    job_type: str
    last_run_at: str | None = None
    last_status: str | None = None
    next_run_at: str | None = None


@router.get("/{organization_id}/automations", response_model=list[AutomationResponse])
def get_org_automations(
    organization_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_staff),
) -> list[dict]:
    service = AutomationSettingsService(db)
    return service.list_org_automations(organization_id)


class AutomationUpdatePayload(BaseModel):
    type: str
    enabled: bool | None = None
    config: dict | None = None


class AutomationUpdateRequest(BaseModel):
    automations: list[AutomationUpdatePayload]


@router.patch("/{organization_id}/automations", response_model=list[AutomationResponse])
def update_org_automations(
    organization_id: uuid.UUID,
    payload: AutomationUpdateRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_staff),
) -> list[dict]:
    service = AutomationSettingsService(db)
    return service.update_org_automations(organization_id, [item.model_dump() for item in payload.automations])


class RunNowRequest(BaseModel):
    type: str
    location_id: uuid.UUID | None = None
    payload: dict | None = None


class RunNowResponse(BaseModel):
    job_id: uuid.UUID
    job_type: str
    status: str


@router.post("/{organization_id}/run-now", response_model=RunNowResponse, status_code=status.HTTP_201_CREATED)
def run_automation_now(
    organization_id: uuid.UUID,
    payload: RunNowRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_staff),
) -> RunNowResponse:
    definition = AUTOMATION_DEFINITIONS.get(payload.type)
    if not definition:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown automation type")
    job_service = JobService(db)
    job = job_service.dispatch_job(
        organization_id=organization_id,
        job_type=definition["job_type"] if payload.type in AUTOMATION_DEFINITIONS else payload.type,
        location_id=payload.location_id,
        payload=payload.payload,
    )
    return RunNowResponse(job_id=job.id, job_type=job.job_type, status=job.status)

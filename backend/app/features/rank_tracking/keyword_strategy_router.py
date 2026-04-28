from __future__ import annotations

from datetime import datetime
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.app.api.deps import get_current_user, require_org_member
from backend.app.db.session import get_db
from backend.app.services.access import AccessService
from backend.app.services.keyword_strategy import KeywordCampaignService

router = APIRouter(
    prefix="/keyword-strategy",
    tags=["keyword-strategy"],
    dependencies=[Depends(get_current_user), Depends(require_org_member)],
)


class RunKeywordCampaignRequest(BaseModel):
    organization_id: uuid.UUID
    location_id: uuid.UUID
    cycle_year: int | None = Field(default=None, ge=2020, le=2100)
    cycle_month: int | None = Field(default=None, ge=1, le=12)
    trigger_source: str = "manual"
    onboarding_triggered: bool = False


class RunKeywordCampaignResponse(BaseModel):
    cycle_id: uuid.UUID
    cycle_year: int
    cycle_month: int
    status: str
    followup_due_at: datetime | None = None


@router.post("/run", response_model=RunKeywordCampaignResponse, status_code=status.HTTP_202_ACCEPTED)
def run_keyword_campaign(
    payload: RunKeywordCampaignRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> RunKeywordCampaignResponse:
    access = AccessService(db)
    try:
        access.resolve_org(user_id=current_user.id, organization_id=payload.organization_id)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    service = KeywordCampaignService(db)
    try:
        cycle = service.run_cycle(
            organization_id=payload.organization_id,
            location_id=payload.location_id,
            cycle_year=payload.cycle_year,
            cycle_month=payload.cycle_month,
            trigger_source=payload.trigger_source,
            onboarding_triggered=payload.onboarding_triggered,
        )
        return RunKeywordCampaignResponse(
            cycle_id=cycle.id,
            cycle_year=cycle.cycle_year,
            cycle_month=cycle.cycle_month,
            status=cycle.status,
            followup_due_at=cycle.followup_due_at,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/cycles/{cycle_id}/followup", response_model=RunKeywordCampaignResponse)
def run_followup(
    cycle_id: uuid.UUID,
    organization_id: uuid.UUID = Query(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> RunKeywordCampaignResponse:
    access = AccessService(db)
    try:
        access.resolve_org(user_id=current_user.id, organization_id=organization_id)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    service = KeywordCampaignService(db)
    try:
        cycle = service.run_followup_scan(cycle_id=cycle_id)
        if cycle.organization_id != organization_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cycle does not belong to organization")
        return RunKeywordCampaignResponse(
            cycle_id=cycle.id,
            cycle_year=cycle.cycle_year,
            cycle_month=cycle.cycle_month,
            status=cycle.status,
            followup_due_at=cycle.followup_due_at,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get("/locations/{location_id}/dashboard")
def keyword_strategy_dashboard(
    location_id: uuid.UUID,
    organization_id: uuid.UUID = Query(...),
    cycle_id: uuid.UUID | None = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> dict:
    access = AccessService(db)
    try:
        access.resolve_org(user_id=current_user.id, organization_id=organization_id)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    service = KeywordCampaignService(db)
    try:
        return service.build_dashboard_payload(
            organization_id=organization_id,
            location_id=location_id,
            cycle_id=cycle_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get("/locations/{location_id}/cycles")
def list_keyword_cycles(
    location_id: uuid.UUID,
    organization_id: uuid.UUID = Query(...),
    limit: int = Query(12, ge=1, le=36),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> list[dict]:
    access = AccessService(db)
    try:
        access.resolve_org(user_id=current_user.id, organization_id=organization_id)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    service = KeywordCampaignService(db)
    cycles = service.list_cycles(
        organization_id=organization_id,
        location_id=location_id,
        limit=limit,
    )
    return [
        {
            "id": str(cycle.id),
            "cycle_year": cycle.cycle_year,
            "cycle_month": cycle.cycle_month,
            "status": cycle.status,
            "trigger_source": cycle.trigger_source,
            "onboarding_triggered": cycle.onboarding_triggered,
            "created_at": cycle.created_at,
            "followup_due_at": cycle.followup_due_at,
            "followup_scanned_at": cycle.followup_scanned_at,
        }
        for cycle in cycles
    ]


@router.get("/cycles/{cycle_id}")
def get_keyword_cycle(
    cycle_id: uuid.UUID,
    organization_id: uuid.UUID = Query(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> dict:
    access = AccessService(db)
    try:
        access.resolve_org(user_id=current_user.id, organization_id=organization_id)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    service = KeywordCampaignService(db)
    from backend.app.models.keyword_campaign_cycle import KeywordCampaignCycle

    row = db.get(KeywordCampaignCycle, cycle_id)
    if not row or row.organization_id != organization_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign cycle not found")
    return service.build_dashboard_payload(
        organization_id=organization_id,
        location_id=row.location_id,
        cycle_id=cycle_id,
    )

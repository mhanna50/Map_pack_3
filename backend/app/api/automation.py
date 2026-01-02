from __future__ import annotations

import uuid

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from ..db.session import get_db
from ..models.automation_rule import AutomationRule
from ..models.rule_simulation import RuleSimulation
from ..models.enums import (
    ActionType,
    AutomationActionType,
    AutomationCondition,
    AutomationTriggerType,
)
from ..services.actions import ActionService
from ..services.automation_rules import AutomationRuleService

router = APIRouter(prefix="/automation", tags=["automation"])


class AutomationRuleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    location_id: uuid.UUID | None = None
    name: str
    trigger_type: AutomationTriggerType
    condition: AutomationCondition
    action_type: AutomationActionType
    config: dict | None = None
    action_config: dict | None = None
    priority: int
    weight: int
    enabled: bool


class RuleCreateRequest(BaseModel):
    organization_id: uuid.UUID
    location_id: uuid.UUID | None = None
    name: str
    trigger_type: AutomationTriggerType
    condition: AutomationCondition = AutomationCondition.ALWAYS
    action_type: AutomationActionType
    config: dict | None = Field(default_factory=dict)
    action_config: dict | None = Field(default_factory=dict)
    priority: int = 0
    weight: int = 100


@router.post("/rules", response_model=AutomationRuleResponse, status_code=status.HTTP_201_CREATED)
def create_rule(payload: RuleCreateRequest, db: Session = Depends(get_db)) -> AutomationRule:
    service = AutomationRuleService(db)
    return service.create_rule(
        organization_id=payload.organization_id,
        location_id=payload.location_id,
        name=payload.name,
        trigger_type=payload.trigger_type,
        condition=payload.condition,
        action_type=payload.action_type,
        config=payload.config,
        action_config=payload.action_config,
        priority=payload.priority,
        weight=payload.weight,
    )


@router.get("/rules", response_model=list[AutomationRuleResponse])
def list_rules(
    organization_id: uuid.UUID = Query(...),
    location_id: uuid.UUID | None = Query(None),
    db: Session = Depends(get_db),
) -> list[AutomationRule]:
    service = AutomationRuleService(db)
    return service.list_rules(organization_id=organization_id, location_id=location_id)


class RuleUpdateRequest(BaseModel):
    name: str | None = None
    config: dict | None = None
    action_config: dict | None = None
    priority: int | None = None
    weight: int | None = None
    enabled: bool | None = None


@router.patch("/rules/{rule_id}", response_model=AutomationRuleResponse)
def update_rule(rule_id: uuid.UUID, payload: RuleUpdateRequest, db: Session = Depends(get_db)) -> AutomationRule:
    service = AutomationRuleService(db)
    rule = service.get_rule(rule_id)
    if not rule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rule not found")
    updates = payload.model_dump(exclude_unset=True)
    return service.update_rule(rule, **updates)


class SimulationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    triggered_actions: int
    summary: str | None = None
    metrics: dict | None = None
    sample_payload: dict | None = None


@router.post("/rules/{rule_id}/simulate", response_model=SimulationResponse)
def simulate_rule(
    rule_id: uuid.UUID,
    days: int = Query(30, ge=1, le=90),
    db: Session = Depends(get_db),
) -> "RuleSimulation":
    service = AutomationRuleService(db)
    rule = service.get_rule(rule_id)
    if not rule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rule not found")
    return service.simulate(rule, days=days)


class RunRulesRequest(BaseModel):
    organization_id: uuid.UUID
    location_id: uuid.UUID | None = None
    schedule: bool = False


class RunRulesResponse(BaseModel):
    triggered: int
    scheduled: bool = False


@router.post("/rules/run", response_model=RunRulesResponse)
def run_rules(payload: RunRulesRequest, db: Session = Depends(get_db)) -> RunRulesResponse:
    service = AutomationRuleService(db)
    if payload.schedule:
        action_service = ActionService(db)
        action = action_service.schedule_action(
            organization_id=payload.organization_id,
            action_type=ActionType.RUN_AUTOMATION_RULES,
            run_at=datetime.now(timezone.utc),
            payload={
                "organization_id": str(payload.organization_id),
                "location_id": str(payload.location_id) if payload.location_id else None,
            },
            location_id=payload.location_id,
        )
        return RunRulesResponse(triggered=0, scheduled=True)
    results = service.trigger_due_rules(
        organization_id=payload.organization_id, location_id=payload.location_id
    )
    return RunRulesResponse(triggered=len(results), scheduled=False)

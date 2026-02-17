from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, ConfigDict
from sqlalchemy.orm import Session

from backend.app.api.deps import get_current_user, require_org_member
from ..core.config import settings
from ..db.session import get_db
from ..models.action import Action
from ..models.enums import ActionStatus, ActionType
from ..services.actions import ActionService
from ..services.access import AccessService

router = APIRouter(
    prefix="/actions",
    tags=["actions"],
    dependencies=[Depends(get_current_user), Depends(require_org_member)],
)


class ActionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    location_id: uuid.UUID | None = None
    connected_account_id: uuid.UUID | None = None
    action_type: ActionType
    status: ActionStatus
    run_at: datetime
    attempts: int
    max_attempts: int
    payload: dict | None = None
    result: dict | None = None
    error: str | None = None


class ActionCreateRequest(BaseModel):
    organization_id: uuid.UUID
    action_type: ActionType
    run_at: datetime = Field(
        default_factory=lambda: datetime.utcnow(),
        description="UTC timestamp when this action should run.",
    )
    payload: dict | None = None
    location_id: uuid.UUID | None = None
    connected_account_id: uuid.UUID | None = None
    max_attempts: int | None = None
    dedupe_key: str | None = Field(
        default=None, description="Prevents duplicate scheduling when provided."
    )
    priority: int = 0


@router.post("/", response_model=ActionResponse, status_code=status.HTTP_201_CREATED)
def schedule_action(
    payload: ActionCreateRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> Action:
    access = AccessService(db)
    try:
        access.resolve_org(user_id=current_user.id, organization_id=payload.organization_id)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    service = ActionService(db)
    try:
        action = service.schedule_action(
            organization_id=payload.organization_id,
            action_type=payload.action_type,
            run_at=payload.run_at,
            payload=payload.payload,
            location_id=payload.location_id,
            connected_account_id=payload.connected_account_id,
            max_attempts=payload.max_attempts or settings.ACTION_MAX_ATTEMPTS,
            dedupe_key=payload.dedupe_key,
            priority=payload.priority,
        )
        return action
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/", response_model=list[ActionResponse])
def list_actions(
    organization_id: uuid.UUID | None = Query(default=None),
    status_filter: ActionStatus | None = Query(default=None, alias="status"),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> list[Action]:
    query = db.query(Action)
    if organization_id:
        query = query.filter(Action.organization_id == organization_id)
    if status_filter:
        query = query.filter(Action.status == status_filter)
    return query.order_by(Action.run_at.asc()).limit(250).all()

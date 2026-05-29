from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.app.api.deps import get_current_staff, get_current_user
from backend.app.db.session import get_db
from backend.app.models.identity.user import User
from backend.app.models.integrations.integration_health import IntegrationHealthCheck
from backend.app.services.auth.access import AccessDeniedError, AccessService
from backend.app.services.integrations.health import IntegrationHealthCheckRunner, IntegrationHealthService

admin_router = APIRouter(prefix="/admin/health", tags=["admin_health"], dependencies=[Depends(get_current_staff)])
client_router = APIRouter(prefix="/client/health", tags=["client_health"], dependencies=[Depends(get_current_user)])
client_integrations_router = APIRouter(prefix="/client/integrations", tags=["client_integrations"], dependencies=[Depends(get_current_user)])


class IncidentStatusUpdate(BaseModel):
    status: str


@admin_router.get("/overview")
def admin_health_overview(db: Session = Depends(get_db)) -> dict[str, Any]:
    return IntegrationHealthService(db).admin_overview()


@admin_router.get("/incidents")
def admin_health_incidents(
    status_filter: str | None = Query(None, alias="status"),
    severity: str | None = None,
    integration: str | None = None,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    service = IntegrationHealthService(db)
    return {"rows": [_incident_row(row) for row in service.list_incidents(status=status_filter, severity=severity, integration=integration)]}


@admin_router.get("/incidents/{incident_id}")
def admin_health_incident_detail(incident_id: uuid.UUID, db: Session = Depends(get_db)) -> dict[str, Any]:
    detail = IntegrationHealthService(db).incident_detail(incident_id)
    if not detail:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found")
    return detail


@admin_router.patch("/incidents/{incident_id}")
def admin_health_update_incident(incident_id: uuid.UUID, payload: IncidentStatusUpdate, db: Session = Depends(get_db)) -> dict[str, Any]:
    if payload.status not in {"open", "investigating", "recovered", "resolved", "ignored"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid incident status")
    row = IntegrationHealthService(db).update_incident_status(incident_id, payload.status)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found")
    return {"incident": _incident_row(row)}


@admin_router.post("/incidents/{incident_id}/resolve")
def admin_health_resolve_incident(incident_id: uuid.UUID, db: Session = Depends(get_db)) -> dict[str, Any]:
    row = IntegrationHealthService(db).update_incident_status(incident_id, "resolved")
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found")
    return {"incident": _incident_row(row)}


@admin_router.post("/incidents/{incident_id}/ignore")
def admin_health_ignore_incident(incident_id: uuid.UUID, db: Session = Depends(get_db)) -> dict[str, Any]:
    row = IntegrationHealthService(db).update_incident_status(incident_id, "ignored")
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found")
    return {"incident": _incident_row(row)}


@admin_router.post("/incidents/{incident_id}/retry")
def admin_health_retry_incident(incident_id: uuid.UUID, db: Session = Depends(get_db)) -> dict[str, Any]:
    service = IntegrationHealthService(db)
    detail = service.incident_detail(incident_id)
    if not detail:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found")
    incident = detail["incident"]
    service.record_recovery_attempt(
        tenant_id=uuid.UUID(incident["tenant_id"]) if incident.get("tenant_id") else None,
        incident_id=incident_id,
        integration=str(incident["integration"]),
        module=incident.get("module"),
        action="manual_retry_requested",
        status="attempted",
        message="Admin requested retry. The next scheduled health check will verify recovery.",
    )
    return {"queued": True}


@admin_router.get("/integrations")
def admin_health_integrations(
    status_filter: str | None = Query(None, alias="status"),
    severity: str | None = None,
    integration: str | None = None,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    query = db.query(IntegrationHealthCheck)
    if status_filter:
        query = query.filter(IntegrationHealthCheck.status == status_filter)
    if severity:
        query = query.filter(IntegrationHealthCheck.severity == severity)
    if integration:
        query = query.filter(IntegrationHealthCheck.integration == integration)
    rows = query.order_by(IntegrationHealthCheck.last_checked_at.desc().nullslast()).limit(500).all()
    return {"rows": [_health_row(row) for row in rows]}


@admin_router.get("/recovery-attempts")
def admin_health_recovery_attempts(db: Session = Depends(get_db)) -> dict[str, Any]:
    overview = IntegrationHealthService(db).admin_overview()
    return {"rows": overview["recent_recovery_attempts"]}


@admin_router.post("/run")
def admin_run_health_check(db: Session = Depends(get_db)) -> dict[str, Any]:
    runner = IntegrationHealthCheckRunner(db)
    return {"platform": runner.run_platform_health_check(), "tenants": runner.run_all_tenant_health_checks(limit=250)}


@client_router.get("/prompts")
def client_health_prompts(
    organization_id: uuid.UUID | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    tenant_id = _resolve_tenant_id(db, current_user.id, organization_id)
    prompts = IntegrationHealthService(db).list_client_prompts(tenant_id)
    return {"rows": [_prompt_row(row) for row in prompts]}


@client_router.get("/integrations/status")
def client_integrations_status(
    organization_id: uuid.UUID | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    tenant_id = _resolve_tenant_id(db, current_user.id, organization_id)
    rows = (
        db.query(IntegrationHealthCheck)
        .filter(IntegrationHealthCheck.tenant_id == tenant_id)
        .order_by(IntegrationHealthCheck.updated_at.desc())
        .limit(100)
        .all()
    )
    return {"rows": [_client_health_row(row) for row in rows]}


@client_integrations_router.get("/status")
def client_integrations_status_alias(
    organization_id: uuid.UUID | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    return client_integrations_status(organization_id=organization_id, db=db, current_user=current_user)


def _resolve_tenant_id(db: Session, user_id: uuid.UUID, organization_id: uuid.UUID | None) -> uuid.UUID:
    try:
        _, org = AccessService(db).resolve_org(user_id=user_id, organization_id=organization_id)
    except AccessDeniedError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    if db.bind and db.bind.dialect.name == "postgresql":
        db.execute(text("SET LOCAL app.current_org = :org_id"), {"org_id": str(org.id)})
    return org.id


def _health_row(row: IntegrationHealthCheck) -> dict[str, Any]:
    return {
        "id": str(row.id),
        "tenant_id": str(row.tenant_id) if row.tenant_id else None,
        "integration": row.integration,
        "module": row.module,
        "status": row.status,
        "severity": row.severity,
        "category": row.category,
        "message": row.message,
        "safe_details": row.safe_details or {},
        "last_checked_at": row.last_checked_at.isoformat() if row.last_checked_at else None,
        "last_success_at": row.last_success_at.isoformat() if row.last_success_at else None,
        "last_failure_at": row.last_failure_at.isoformat() if row.last_failure_at else None,
        "failure_count": row.failure_count,
        "recovery_attempt_count": row.recovery_attempt_count,
        "next_retry_at": row.next_retry_at.isoformat() if row.next_retry_at else None,
        "is_user_action_required": row.is_user_action_required,
        "user_action_type": row.user_action_type,
        "admin_action_required": row.admin_action_required,
    }


def _client_health_row(row: IntegrationHealthCheck) -> dict[str, Any]:
    safe_message = (
        "This feature is temporarily unavailable. We've been notified and are working on it."
        if row.admin_action_required and not row.is_user_action_required
        else row.message
    )
    return {
        "integration": row.integration,
        "module": row.module,
        "status": row.status,
        "severity": row.severity,
        "message": safe_message,
        "is_user_action_required": row.is_user_action_required,
        "user_action_type": row.user_action_type,
    }


def _incident_row(row) -> dict[str, Any]:
    return {
        "id": str(row.id),
        "tenant_id": str(row.tenant_id) if row.tenant_id else None,
        "integration": row.integration,
        "module": row.module,
        "severity": row.severity,
        "category": row.category,
        "title": row.title,
        "message": row.message,
        "safe_error_summary": row.safe_error_summary,
        "safe_details": row.safe_details or {},
        "status": row.status,
        "first_seen_at": row.first_seen_at.isoformat() if row.first_seen_at else None,
        "last_seen_at": row.last_seen_at.isoformat() if row.last_seen_at else None,
        "resolved_at": row.resolved_at.isoformat() if row.resolved_at else None,
        "affected_count": row.affected_count,
        "recovery_attempts": row.recovery_attempts or [],
    }


def _prompt_row(row) -> dict[str, Any]:
    return {
        "id": str(row.id),
        "tenant_id": str(row.tenant_id),
        "integration": row.integration,
        "module": row.module,
        "reason": row.reason,
        "status": row.status,
        "action_url": row.action_url,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "resolved_at": row.resolved_at.isoformat() if row.resolved_at else None,
    }


router = APIRouter()
router.include_router(admin_router)
router.include_router(client_router)
router.include_router(client_integrations_router)

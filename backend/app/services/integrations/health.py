from __future__ import annotations

import logging
import random
import re
import uuid
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.app.core.config import settings
from backend.app.models.automation.action import Action
from backend.app.models.enums import ActionStatus, GbpConnectionStatus
from backend.app.models.google_business.gbp_connection import GbpConnection
from backend.app.models.identity.organization import Organization
from backend.app.models.integrations.integration_health import (
    ClientReconnectPrompt,
    IntegrationHealthCheck,
    IntegrationIncident,
    IntegrationRecoveryAttempt,
)

logger = logging.getLogger(__name__)

INTEGRATION_CATEGORIES = {
    "auth_expired",
    "auth_revoked",
    "token_refresh_failed",
    "secret_missing",
    "secret_invalid",
    "permission_denied",
    "quota_exceeded",
    "rate_limited",
    "provider_down",
    "network_error",
    "timeout",
    "webhook_signature_invalid",
    "webhook_delivery_failed",
    "invalid_request",
    "data_validation_error",
    "tenant_config_missing",
    "payment_failed",
    "subscription_inactive",
    "background_job_failed",
    "queue_backlog",
    "unknown_error",
}
HEALTH_STATUSES = {"healthy", "degraded", "disconnected", "needs_reauth", "misconfigured", "paused", "failing", "unknown"}
SEVERITIES = {"info", "warning", "critical"}
CLIENT_GBP_RECONNECT_MESSAGE = (
    "Your Google Business Profile connection needs to be reconnected. Some automations are paused until you reconnect."
)
SECRET_KEYS = {
    "access_token",
    "refresh_token",
    "id_token",
    "api_key",
    "apikey",
    "authorization",
    "auth",
    "auth_header",
    "client_secret",
    "secret",
    "signature",
    "stripe_signature",
    "service_role_key",
    "twilio_auth_token",
    "token",
    "password",
}
SECRET_PATTERNS = [
    re.compile(r"Bearer\s+[A-Za-z0-9._~+/=-]+", re.IGNORECASE),
    re.compile(r"sk_(?:live|test)_[A-Za-z0-9]+", re.IGNORECASE),
    re.compile(r"SG\.[A-Za-z0-9._-]+", re.IGNORECASE),
    re.compile(r"ya29\.[A-Za-z0-9._-]+", re.IGNORECASE),
    re.compile(r"(access_token|refresh_token|api_key|client_secret|authorization|secret)=([^\s&]+)", re.IGNORECASE),
]


@dataclass(frozen=True)
class ClassifiedIntegrationError:
    category: str
    severity: str
    retryable: bool
    provider_status_code: int | None = None
    provider_error_code: str | None = None
    sanitized_message: str = "Integration request failed"


def sanitize_error(error: Any) -> dict[str, Any]:
    if isinstance(error, HTTPException):
        raw: Any = {"status_code": error.status_code, "detail": error.detail}
    elif isinstance(error, httpx.HTTPStatusError):
        raw = {
            "status_code": error.response.status_code,
            "message": str(error),
            "response": _safe_json(error.response),
        }
    elif isinstance(error, httpx.RequestError):
        raw = {"message": str(error), "request_url": str(error.request.url) if error.request else None}
    elif isinstance(error, BaseException):
        raw = {"type": error.__class__.__name__, "message": str(error)}
    elif isinstance(error, dict):
        raw = error
    else:
        raw = {"value": str(error)}
    return _sanitize_value(raw)


def sanitize_message(message: str | None) -> str:
    sanitized = str(message or "Integration request failed")
    for pattern in SECRET_PATTERNS:
        sanitized = pattern.sub("[redacted]", sanitized)
    return sanitized[:1000]


def classify_integration_error(error: Any) -> ClassifiedIntegrationError:
    status_code = _status_code(error)
    raw_message = _raw_message(error).lower()
    provider_error_code = _provider_error_code(error)

    if "invalid_grant" in raw_message or "revoked" in raw_message:
        return ClassifiedIntegrationError("auth_revoked", "critical", False, status_code, provider_error_code, sanitize_message(_raw_message(error)))
    if "expired" in raw_message and ("token" in raw_message or "authorization" in raw_message):
        return ClassifiedIntegrationError("auth_expired", "warning", True, status_code, provider_error_code, sanitize_message(_raw_message(error)))
    if "signature" in raw_message and "webhook" in raw_message:
        return ClassifiedIntegrationError("webhook_signature_invalid", "critical", False, status_code, provider_error_code, sanitize_message(_raw_message(error)))
    if "api key" in raw_message or "client secret" in raw_message or "secret" in raw_message or "credential" in raw_message:
        missing = "missing" in raw_message or "not configured" in raw_message
        return ClassifiedIntegrationError("secret_missing" if missing else "secret_invalid", "critical", False, status_code, provider_error_code, sanitize_message(_raw_message(error)))
    if status_code in {401, 403}:
        return ClassifiedIntegrationError("permission_denied", "critical" if status_code == 401 else "warning", False, status_code, provider_error_code, sanitize_message(_raw_message(error)))
    if status_code == 429 or "rate limit" in raw_message or "rate_limited" in raw_message:
        return ClassifiedIntegrationError("rate_limited", "warning", True, status_code, provider_error_code, sanitize_message(_raw_message(error)))
    if "quota" in raw_message:
        return ClassifiedIntegrationError("quota_exceeded", "warning", True, status_code, provider_error_code, sanitize_message(_raw_message(error)))
    if isinstance(error, (httpx.TimeoutException, TimeoutError)) or "timeout" in raw_message:
        return ClassifiedIntegrationError("timeout", "warning", True, status_code, provider_error_code, sanitize_message(_raw_message(error)))
    if isinstance(error, httpx.RequestError) or "network" in raw_message:
        return ClassifiedIntegrationError("network_error", "warning", True, status_code, provider_error_code, sanitize_message(_raw_message(error)))
    if status_code and status_code >= 500:
        return ClassifiedIntegrationError("provider_down", "warning", True, status_code, provider_error_code, sanitize_message(_raw_message(error)))
    if status_code and status_code >= 400:
        return ClassifiedIntegrationError("invalid_request", "warning", False, status_code, provider_error_code, sanitize_message(_raw_message(error)))
    return ClassifiedIntegrationError("unknown_error", "warning", True, status_code, provider_error_code, sanitize_message(_raw_message(error)))


def should_retry(category: str, *, attempt: int, max_attempts: int = 3) -> bool:
    if attempt >= max_attempts:
        return False
    return category in {"network_error", "timeout", "rate_limited", "provider_down", "quota_exceeded"}


def next_retry_time(category: str, *, attempt: int, now: datetime | None = None) -> datetime | None:
    if not should_retry(category, attempt=attempt, max_attempts=6):
        return None
    base = 60 if category in {"rate_limited", "quota_exceeded"} else 20
    delay = min(base * (2 ** max(0, attempt - 1)), 60 * 60)
    delay += random.randint(0, min(delay, 60))
    return (now or datetime.now(timezone.utc)) + timedelta(seconds=delay)


@contextmanager
def with_integration_monitoring(
    db: Session,
    *,
    integration: str,
    module: str | None,
    operation: str,
    tenant_id: uuid.UUID | None,
):
    service = IntegrationHealthService(db)
    try:
        result = yield
        service.mark_integration_recovered(
            tenant_id=tenant_id,
            integration=integration,
            module=module,
            message=f"{operation} succeeded",
            safe_details={"operation": operation},
        )
        return result
    except Exception as exc:
        service.record_failure(
            tenant_id=tenant_id,
            integration=integration,
            module=module,
            operation=operation,
            error=exc,
        )
        raise


class IntegrationHealthService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def record_health(
        self,
        *,
        tenant_id: uuid.UUID | None,
        integration: str,
        module: str | None,
        status: str,
        severity: str,
        message: str,
        category: str | None = None,
        safe_details: dict[str, Any] | None = None,
        is_user_action_required: bool = False,
        user_action_type: str | None = None,
        admin_action_required: bool = False,
        next_retry_at: datetime | None = None,
    ) -> IntegrationHealthCheck:
        now = datetime.now(timezone.utc)
        status = status if status in HEALTH_STATUSES else "unknown"
        severity = severity if severity in SEVERITIES else "warning"
        category = category if category in INTEGRATION_CATEGORIES else category
        row = (
            self.db.query(IntegrationHealthCheck)
            .filter(
                IntegrationHealthCheck.tenant_id == tenant_id,
                IntegrationHealthCheck.integration == integration,
                IntegrationHealthCheck.module == module,
            )
            .one_or_none()
        )
        if not row:
            row = IntegrationHealthCheck(
                tenant_id=tenant_id,
                integration=integration,
                module=module,
                failure_count=0,
                recovery_attempt_count=0,
                created_at=now,
            )
            self.db.add(row)
        row.status = status
        row.severity = severity
        row.category = category
        row.message = sanitize_message(message)
        row.safe_details = _sanitize_value(safe_details or {})
        row.last_checked_at = now
        row.next_retry_at = next_retry_at
        row.is_user_action_required = is_user_action_required
        row.user_action_type = user_action_type
        row.admin_action_required = admin_action_required
        row.updated_at = now
        if status == "healthy":
            row.last_success_at = now
            row.resolved_at = now
            row.failure_count = 0
        else:
            row.last_failure_at = now
            row.resolved_at = None
            row.failure_count = (row.failure_count or 0) + 1
        self.db.commit()
        self.db.refresh(row)
        return row

    def record_failure(
        self,
        *,
        tenant_id: uuid.UUID | None,
        integration: str,
        module: str | None,
        operation: str,
        error: Any,
        title: str | None = None,
        message: str | None = None,
        safe_details: dict[str, Any] | None = None,
        force_category: str | None = None,
        force_severity: str | None = None,
    ) -> IntegrationIncident:
        classified = classify_integration_error(error)
        category = force_category or classified.category
        severity = force_severity or classified.severity
        details = sanitize_error(error)
        if safe_details:
            details.update(_sanitize_value(safe_details))
        now = datetime.now(timezone.utc)
        retry_at = next_retry_time(category, attempt=1, now=now)
        self.record_health(
            tenant_id=tenant_id,
            integration=integration,
            module=module,
            status=_status_for_category(category),
            severity=severity,
            category=category,
            message=message or classified.sanitized_message,
            safe_details={
                **details,
                "operation": operation,
                "provider_status_code": classified.provider_status_code,
                "provider_error_code": classified.provider_error_code,
                "retryable": classified.retryable,
            },
            is_user_action_required=category in {"auth_revoked", "token_refresh_failed", "auth_expired"},
            user_action_type="google_reconnect" if integration in {"google", "google_business_profile"} and category in {"auth_revoked", "token_refresh_failed", "auth_expired"} else None,
            admin_action_required=category in {"secret_missing", "secret_invalid", "webhook_signature_invalid"},
            next_retry_at=retry_at,
        )
        return self.open_or_update_incident(
            tenant_id=tenant_id,
            integration=integration,
            module=module,
            severity=severity,
            category=category,
            title=title or _default_title(integration, module, category),
            message=message or classified.sanitized_message,
            safe_error_summary=classified.sanitized_message,
            safe_details={
                **details,
                "operation": operation,
                "provider_status_code": classified.provider_status_code,
                "provider_error_code": classified.provider_error_code,
                "retryable": classified.retryable,
                "next_retry_at": retry_at.isoformat() if retry_at else None,
            },
        )

    def open_or_update_incident(
        self,
        *,
        tenant_id: uuid.UUID | None,
        integration: str,
        module: str | None,
        severity: str,
        category: str,
        title: str,
        message: str,
        safe_error_summary: str | None = None,
        safe_details: dict[str, Any] | None = None,
    ) -> IntegrationIncident:
        now = datetime.now(timezone.utc)
        row = (
            self.db.query(IntegrationIncident)
            .filter(
                IntegrationIncident.tenant_id == tenant_id,
                IntegrationIncident.integration == integration,
                IntegrationIncident.module == module,
                IntegrationIncident.category == category,
                IntegrationIncident.status.in_(["open", "investigating"]),
            )
            .one_or_none()
        )
        if row:
            row.last_seen_at = now
            row.affected_count = (row.affected_count or 1) + 1
            row.severity = severity
            row.message = sanitize_message(message)
            row.safe_error_summary = sanitize_message(safe_error_summary)
            row.safe_details = _sanitize_value(safe_details or {})
            row.updated_at = now
        else:
            row = IntegrationIncident(
                tenant_id=tenant_id,
                integration=integration,
                module=module,
                severity=severity,
                category=category,
                title=sanitize_message(title)[:255],
                message=sanitize_message(message),
                safe_error_summary=sanitize_message(safe_error_summary),
                safe_details=_sanitize_value(safe_details or {}),
                status="open",
                first_seen_at=now,
                last_seen_at=now,
                recovery_attempts=[],
                affected_count=1,
                created_at=now,
                updated_at=now,
            )
            self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        logger.warning(
            "integration_incident_open tenant=%s integration=%s module=%s category=%s severity=%s",
            tenant_id,
            integration,
            module,
            category,
            severity,
        )
        return row

    def record_recovery_attempt(
        self,
        *,
        tenant_id: uuid.UUID | None,
        integration: str,
        module: str | None,
        action: str,
        status: str,
        message: str | None = None,
        incident_id: uuid.UUID | None = None,
        safe_details: dict[str, Any] | None = None,
    ) -> IntegrationRecoveryAttempt:
        now = datetime.now(timezone.utc)
        row = IntegrationRecoveryAttempt(
            tenant_id=tenant_id,
            incident_id=incident_id,
            integration=integration,
            module=module,
            action=action,
            status=status,
            message=sanitize_message(message),
            safe_details=_sanitize_value(safe_details or {}),
            created_at=now,
        )
        self.db.add(row)
        health = (
            self.db.query(IntegrationHealthCheck)
            .filter(
                IntegrationHealthCheck.tenant_id == tenant_id,
                IntegrationHealthCheck.integration == integration,
                IntegrationHealthCheck.module == module,
            )
            .one_or_none()
        )
        if health:
            health.recovery_attempt_count = (health.recovery_attempt_count or 0) + 1
            health.updated_at = now
            self.db.add(health)
        incident = self.db.get(IntegrationIncident, incident_id) if incident_id else None
        if incident:
            attempts = list(incident.recovery_attempts or [])
            attempts.append({"action": action, "status": status, "message": sanitize_message(message), "created_at": now.isoformat()})
            incident.recovery_attempts = attempts[-50:]
            incident.updated_at = now
            self.db.add(incident)
        self.db.commit()
        self.db.refresh(row)
        return row

    def mark_integration_recovered(
        self,
        *,
        tenant_id: uuid.UUID | None,
        integration: str,
        module: str | None,
        message: str = "Integration health check succeeded",
        safe_details: dict[str, Any] | None = None,
    ) -> None:
        self.record_health(
            tenant_id=tenant_id,
            integration=integration,
            module=module,
            status="healthy",
            severity="info",
            category=None,
            message=message,
            safe_details=safe_details or {},
        )
        now = datetime.now(timezone.utc)
        incidents = (
            self.db.query(IntegrationIncident)
            .filter(
                IntegrationIncident.tenant_id == tenant_id,
                IntegrationIncident.integration == integration,
                IntegrationIncident.module == module,
                IntegrationIncident.status.in_(["open", "investigating"]),
            )
            .all()
        )
        for incident in incidents:
            incident.status = "recovered"
            incident.resolved_at = now
            incident.updated_at = now
            self.db.add(incident)
        self.db.commit()

    def create_client_reconnect_prompt(
        self,
        *,
        tenant_id: uuid.UUID,
        integration: str = "google_business_profile",
        module: str | None = "gbp",
        reason: str = CLIENT_GBP_RECONNECT_MESSAGE,
        action_url: str = "/onboarding?step=google_profile&reconnect=google_business_profile",
    ) -> ClientReconnectPrompt:
        now = datetime.now(timezone.utc)
        row = (
            self.db.query(ClientReconnectPrompt)
            .filter(
                ClientReconnectPrompt.tenant_id == tenant_id,
                ClientReconnectPrompt.integration == integration,
                ClientReconnectPrompt.module == module,
                ClientReconnectPrompt.status == "active",
            )
            .one_or_none()
        )
        if row:
            row.reason = sanitize_message(reason)
            row.action_url = action_url
        else:
            row = ClientReconnectPrompt(
                tenant_id=tenant_id,
                integration=integration,
                module=module,
                reason=sanitize_message(reason),
                status="active",
                action_url=action_url,
                created_at=now,
            )
            self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        logger.info("client_reconnect_prompt_created tenant=%s integration=%s module=%s", tenant_id, integration, module)
        return row

    def resolve_client_reconnect_prompt(
        self,
        *,
        tenant_id: uuid.UUID,
        integration: str = "google_business_profile",
        module: str | None = "gbp",
    ) -> None:
        now = datetime.now(timezone.utc)
        prompts = (
            self.db.query(ClientReconnectPrompt)
            .filter(
                ClientReconnectPrompt.tenant_id == tenant_id,
                ClientReconnectPrompt.integration == integration,
                ClientReconnectPrompt.module == module,
                ClientReconnectPrompt.status == "active",
            )
            .all()
        )
        for prompt in prompts:
            prompt.status = "completed"
            prompt.resolved_at = now
            self.db.add(prompt)
        self.db.commit()

    def pause_tenant_module_automation(self, *, tenant_id: uuid.UUID, module: str, reason: str) -> None:
        org = self.db.get(Organization, tenant_id)
        if not org:
            return
        metadata = dict(org.metadata_json or {})
        pauses = dict(metadata.get("integration_pauses") or {})
        pauses[module] = {"reason": sanitize_message(reason), "paused_at": datetime.now(timezone.utc).isoformat()}
        metadata["integration_pauses"] = pauses
        org.metadata_json = metadata
        if module in {"gbp", "gbp_posting", "gbp_audits", "reviews", "visibility", "qa", "images"}:
            org.posting_paused = True
        self.db.add(org)
        self.db.commit()
        logger.warning("automation_paused tenant=%s module=%s reason=%s", tenant_id, module, sanitize_message(reason))

    def resume_tenant_module_automation(self, *, tenant_id: uuid.UUID, module: str) -> None:
        org = self.db.get(Organization, tenant_id)
        if not org:
            return
        metadata = dict(org.metadata_json or {})
        pauses = dict(metadata.get("integration_pauses") or {})
        pauses.pop(module, None)
        metadata["integration_pauses"] = pauses
        org.metadata_json = metadata
        if not pauses and org.is_active:
            org.posting_paused = False
        self.db.add(org)
        self.db.commit()
        logger.info("automation_resumed tenant=%s module=%s", tenant_id, module)

    def list_client_prompts(self, tenant_id: uuid.UUID) -> list[ClientReconnectPrompt]:
        return (
            self.db.query(ClientReconnectPrompt)
            .filter(ClientReconnectPrompt.tenant_id == tenant_id, ClientReconnectPrompt.status == "active")
            .order_by(ClientReconnectPrompt.created_at.desc())
            .all()
        )

    def admin_overview(self) -> dict[str, Any]:
        open_incidents = self.db.query(IntegrationIncident).filter(IntegrationIncident.status.in_(["open", "investigating"]))
        recovered = self.db.query(IntegrationIncident).filter(IntegrationIncident.status == "recovered").count()
        critical = open_incidents.filter(IntegrationIncident.severity == "critical").count()
        warning = open_incidents.filter(IntegrationIncident.severity == "warning").count()
        prompts = self.db.query(ClientReconnectPrompt).filter(ClientReconnectPrompt.status == "active").count()
        health_counts = {
            status: count
            for status, count in self.db.query(IntegrationHealthCheck.status, func.count(IntegrationHealthCheck.id))
            .group_by(IntegrationHealthCheck.status)
            .all()
        }
        failed_jobs = self.db.query(Action).filter(Action.status.in_([ActionStatus.FAILED, ActionStatus.DEAD_LETTERED])).count()
        queue_backlog = self.db.query(Action).filter(Action.status.in_([ActionStatus.PENDING, ActionStatus.QUEUED])).count()
        recent_attempts = (
            self.db.query(IntegrationRecoveryAttempt)
            .order_by(IntegrationRecoveryAttempt.created_at.desc())
            .limit(20)
            .all()
        )
        return {
            "overall_status": "critical" if critical else "warning" if warning else "healthy",
            "active_critical_incidents": critical,
            "active_warning_incidents": warning,
            "recovered_incidents": recovered,
            "clients_needing_reconnect": prompts,
            "queue_backlog": queue_backlog,
            "failed_jobs": failed_jobs,
            "health_counts": health_counts,
            "recent_recovery_attempts": [_attempt_payload(row) for row in recent_attempts],
        }

    def list_incidents(self, *, status: str | None = None, severity: str | None = None, integration: str | None = None) -> list[IntegrationIncident]:
        query = self.db.query(IntegrationIncident)
        if status:
            query = query.filter(IntegrationIncident.status == status)
        if severity:
            query = query.filter(IntegrationIncident.severity == severity)
        if integration:
            query = query.filter(IntegrationIncident.integration == integration)
        return query.order_by(IntegrationIncident.last_seen_at.desc().nullslast(), IntegrationIncident.created_at.desc()).limit(500).all()

    def incident_detail(self, incident_id: uuid.UUID) -> dict[str, Any] | None:
        incident = self.db.get(IntegrationIncident, incident_id)
        if not incident:
            return None
        attempts = (
            self.db.query(IntegrationRecoveryAttempt)
            .filter(IntegrationRecoveryAttempt.incident_id == incident.id)
            .order_by(IntegrationRecoveryAttempt.created_at.desc())
            .all()
        )
        return {"incident": _incident_payload(incident), "recovery_attempts": [_attempt_payload(row) for row in attempts]}

    def update_incident_status(self, incident_id: uuid.UUID, status: str) -> IntegrationIncident | None:
        incident = self.db.get(IntegrationIncident, incident_id)
        if not incident:
            return None
        now = datetime.now(timezone.utc)
        incident.status = status
        incident.updated_at = now
        if status in {"recovered", "resolved", "ignored"}:
            incident.resolved_at = now
        self.db.add(incident)
        self.db.commit()
        self.db.refresh(incident)
        return incident


class IntegrationHealthCheckRunner:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.health = IntegrationHealthService(db)

    def run_platform_health_check(self) -> dict[str, Any]:
        results = {
            "config": self._check_config(),
            "background_jobs": self._check_background_jobs(),
        }
        return results

    def run_tenant_integration_health_check(self, tenant_id: uuid.UUID) -> dict[str, Any]:
        return {"google_business_profile": self._check_gbp_connection(tenant_id)}

    def run_all_tenant_health_checks(self, *, limit: int = 100) -> dict[str, int]:
        checked = 0
        for (tenant_id,) in self.db.query(Organization.id).filter(Organization.is_active == True).limit(limit).all():  # noqa: E712
            self.run_tenant_integration_health_check(tenant_id)
            checked += 1
        return {"checked": checked}

    def _check_config(self) -> dict[str, Any]:
        required = {
            "supabase": ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"],
            "google": ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
            "stripe": ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
            "openai": ["OPENAI_API_KEY"],
        }
        if settings.LEAD_RECOVERY_ENABLED:
            required["twilio"] = ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"]
        results: dict[str, Any] = {}
        for integration, names in required.items():
            missing = [name for name in names if not getattr(settings, name, "")]
            if missing:
                self.health.record_health(
                    tenant_id=None,
                    integration=integration,
                    module="platform_config",
                    status="misconfigured",
                    severity="critical",
                    category="secret_missing",
                    message=f"{integration} configuration is missing required environment variables",
                    safe_details={"missing": missing},
                    admin_action_required=True,
                )
                self.health.open_or_update_incident(
                    tenant_id=None,
                    integration=integration,
                    module="platform_config",
                    severity="critical",
                    category="secret_missing",
                    title=f"{integration.title()} configuration missing",
                    message=f"{integration} cannot run until required configuration is present.",
                    safe_details={"missing": missing},
                )
                results[integration] = {"status": "missing", "missing": missing}
            else:
                self.health.mark_integration_recovered(
                    tenant_id=None,
                    integration=integration,
                    module="platform_config",
                    message=f"{integration} required configuration is present",
                    safe_details={"checked": names},
                )
                results[integration] = {"status": "configured"}
        if settings.ALLOW_UNSIGNED_TWILIO_WEBHOOKS:
            self.health.record_health(
                tenant_id=None,
                integration="twilio",
                module="lead_recovery_webhooks",
                status="misconfigured",
                severity="critical",
                category="secret_invalid",
                message="Unsigned Twilio webhooks are enabled. Disable ALLOW_UNSIGNED_TWILIO_WEBHOOKS outside local tests.",
                safe_details={"setting": "ALLOW_UNSIGNED_TWILIO_WEBHOOKS"},
                admin_action_required=True,
            )
            self.health.open_or_update_incident(
                tenant_id=None,
                integration="twilio",
                module="lead_recovery_webhooks",
                severity="critical",
                category="secret_invalid",
                title="Unsigned Twilio webhooks enabled",
                message="Unsigned Twilio webhooks are enabled. Disable ALLOW_UNSIGNED_TWILIO_WEBHOOKS outside local tests.",
                safe_details={"setting": "ALLOW_UNSIGNED_TWILIO_WEBHOOKS"},
            )
            results["twilio_webhooks"] = {"status": "unsigned_webhooks_enabled"}
        return results

    def _check_background_jobs(self) -> dict[str, Any]:
        failed = self.db.query(Action).filter(Action.status.in_([ActionStatus.FAILED, ActionStatus.DEAD_LETTERED])).count()
        backlog = self.db.query(Action).filter(Action.status.in_([ActionStatus.PENDING, ActionStatus.QUEUED])).count()
        severity = "critical" if failed >= 10 or backlog >= 1000 else "warning" if failed or backlog >= 100 else "info"
        status = "failing" if failed >= 10 else "degraded" if failed or backlog >= 100 else "healthy"
        category = "background_job_failed" if failed else "queue_backlog" if backlog >= 100 else None
        self.health.record_health(
            tenant_id=None,
            integration="background_jobs",
            module="celery",
            status=status,
            severity=severity,
            category=category,
            message="Background job health checked",
            safe_details={"failed_jobs": failed, "queue_backlog": backlog},
            admin_action_required=status != "healthy",
        )
        if status != "healthy":
            self.health.open_or_update_incident(
                tenant_id=None,
                integration="background_jobs",
                module="celery",
                severity=severity,
                category=category or "background_job_failed",
                title="Background job health degraded",
                message="Celery actions have failed jobs or queue backlog.",
                safe_details={"failed_jobs": failed, "queue_backlog": backlog},
            )
        return {"failed_jobs": failed, "queue_backlog": backlog, "status": status}

    def _check_gbp_connection(self, tenant_id: uuid.UUID) -> dict[str, Any]:
        connection = self.db.query(GbpConnection).filter(GbpConnection.organization_id == tenant_id).one_or_none()
        if not connection:
            self.health.create_client_reconnect_prompt(tenant_id=tenant_id)
            self.health.pause_tenant_module_automation(tenant_id=tenant_id, module="gbp", reason=CLIENT_GBP_RECONNECT_MESSAGE)
            self.health.record_health(
                tenant_id=tenant_id,
                integration="google_business_profile",
                module="gbp",
                status="disconnected",
                severity="warning",
                category="tenant_config_missing",
                message="Google Business Profile is not connected",
                is_user_action_required=True,
                user_action_type="google_reconnect",
            )
            return {"status": "missing"}
        if connection.status != GbpConnectionStatus.CONNECTED:
            self.health.create_client_reconnect_prompt(tenant_id=tenant_id)
            self.health.pause_tenant_module_automation(tenant_id=tenant_id, module="gbp", reason=CLIENT_GBP_RECONNECT_MESSAGE)
            self.health.record_health(
                tenant_id=tenant_id,
                integration="google_business_profile",
                module="gbp",
                status="needs_reauth",
                severity="critical",
                category="auth_revoked",
                message="Google Business Profile connection needs reauthorization",
                is_user_action_required=True,
                user_action_type="google_reconnect",
            )
            return {"status": "needs_reauth"}
        self.health.mark_integration_recovered(
            tenant_id=tenant_id,
            integration="google_business_profile",
            module="gbp",
            message="Google Business Profile connection is connected",
        )
        return {"status": "connected"}


def _sanitize_value(value: Any) -> Any:
    if isinstance(value, dict):
        clean: dict[str, Any] = {}
        for key, item in value.items():
            normalized = str(key).lower().replace("-", "_")
            if normalized in SECRET_KEYS or any(secret_key in normalized for secret_key in SECRET_KEYS):
                clean[str(key)] = "[redacted]"
            else:
                clean[str(key)] = _sanitize_value(item)
        return clean
    if isinstance(value, list):
        return [_sanitize_value(item) for item in value[:100]]
    if isinstance(value, tuple):
        return [_sanitize_value(item) for item in value[:100]]
    if isinstance(value, str):
        return sanitize_message(value)
    return value


def _safe_json(response: httpx.Response) -> Any:
    try:
        return response.json()
    except Exception:
        return response.text[:500]


def _status_code(error: Any) -> int | None:
    if isinstance(error, HTTPException):
        return error.status_code
    if isinstance(error, httpx.HTTPStatusError):
        return error.response.status_code
    response = getattr(error, "response", None)
    status_code = getattr(response, "status_code", None)
    if isinstance(status_code, int):
        return status_code
    return None


def _provider_error_code(error: Any) -> str | None:
    if isinstance(error, httpx.HTTPStatusError):
        data = _safe_json(error.response)
        if isinstance(data, dict):
            code = data.get("error") or data.get("code")
            if isinstance(code, str):
                return sanitize_message(code)[:120]
            nested = data.get("error")
            if isinstance(nested, dict) and isinstance(nested.get("code"), str):
                return sanitize_message(nested["code"])[:120]
    return None


def _raw_message(error: Any) -> str:
    if isinstance(error, HTTPException):
        return str(error.detail)
    return str(error)


def _status_for_category(category: str) -> str:
    if category in {"auth_revoked", "token_refresh_failed", "auth_expired"}:
        return "needs_reauth"
    if category in {"secret_missing", "secret_invalid", "tenant_config_missing"}:
        return "misconfigured"
    if category in {"rate_limited", "quota_exceeded", "provider_down", "network_error", "timeout"}:
        return "degraded"
    return "failing"


def _default_title(integration: str, module: str | None, category: str) -> str:
    target = f"{integration} {module}" if module else integration
    return f"{target.replace('_', ' ').title()} {category.replace('_', ' ')}"


def _incident_payload(row: IntegrationIncident) -> dict[str, Any]:
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
        "suggested_fix": _suggested_fix(row.category, row.integration),
    }


def _attempt_payload(row: IntegrationRecoveryAttempt) -> dict[str, Any]:
    return {
        "id": str(row.id),
        "tenant_id": str(row.tenant_id) if row.tenant_id else None,
        "incident_id": str(row.incident_id) if row.incident_id else None,
        "integration": row.integration,
        "module": row.module,
        "action": row.action,
        "status": row.status,
        "message": row.message,
        "safe_details": row.safe_details or {},
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


def _suggested_fix(category: str, integration: str) -> str:
    if category in {"auth_revoked", "auth_expired", "token_refresh_failed"} and integration in {"google", "google_business_profile"}:
        return "Ask the client to reconnect Google Business Profile from their dashboard."
    if category in {"secret_missing", "secret_invalid"}:
        return "Check the server environment variable or provider credential in the deployment configuration."
    if category == "webhook_signature_invalid":
        return "Verify the webhook signing secret and provider endpoint configuration."
    if category in {"rate_limited", "quota_exceeded"}:
        return "Wait for the retry window or raise provider quota before retrying."
    return "Inspect sanitized details and retry after the provider or configuration issue is fixed."

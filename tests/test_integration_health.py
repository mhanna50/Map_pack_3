from __future__ import annotations

from datetime import datetime, timedelta, timezone

from backend.app.features.google_business.connections import GbpConnectionService
from backend.app.features.onboarding.tokens import OnboardingTokenSigner
from backend.app.core.config import settings
from backend.app.models.enums import GbpConnectionStatus, MembershipRole, OrganizationType
from backend.app.models.google_business.gbp_connection import GbpConnection
from backend.app.models.identity.membership import Membership
from backend.app.models.identity.organization import Organization
from backend.app.models.identity.user import User
from backend.app.models.integrations.integration_health import ClientReconnectPrompt, IntegrationHealthCheck, IntegrationIncident
from backend.app.services.integrations.health import IntegrationHealthCheckRunner, IntegrationHealthService, sanitize_error


def _org(db_session, name: str = "Health Org") -> Organization:
    org = Organization(name=name, org_type=OrganizationType.BUSINESS, posting_paused=False)
    db_session.add(org)
    db_session.commit()
    return org


def _member(db_session, org: Organization, email: str = "client-health@example.com") -> User:
    user = User(email=email, is_staff=False)
    db_session.add(user)
    db_session.flush()
    db_session.add(Membership(user_id=user.id, organization_id=org.id, role=MembershipRole.OWNER))
    db_session.commit()
    return user


def _connection(db_session, org: Organization, *, expired: bool = True) -> GbpConnection:
    service = GbpConnectionService(db_session)
    return service.upsert_connection(
        organization_id=org.id,
        google_account_email="owner@example.com",
        account_resource_name="accounts/123",
        scopes=["https://www.googleapis.com/auth/business.manage"],
        access_token="old-access-token",
        refresh_token="refresh-token",
        expires_in=-60 if expired else 3600,
    )


def test_error_sanitizer_removes_secrets():
    payload = sanitize_error(
        {
            "access_token": "ya29.secret",
            "refresh_token": "refresh-secret",
            "headers": {"authorization": "Bearer abc.def.ghi"},
            "message": "failed with sk_live_secret and api key",
        }
    )

    rendered = str(payload)
    assert "ya29.secret" not in rendered
    assert "refresh-secret" not in rendered
    assert "Bearer abc.def.ghi" not in rendered
    assert "sk_live_secret" not in rendered
    assert "[redacted]" in rendered


def test_onboarding_tokens_require_configured_encryption_key(monkeypatch):
    monkeypatch.setattr(settings, "ENCRYPTION_KEY", "")

    try:
        OnboardingTokenSigner()
    except ValueError as exc:
        assert "ENCRYPTION_KEY is required" in str(exc)
    else:  # pragma: no cover
        raise AssertionError("OnboardingTokenSigner accepted a blank ENCRYPTION_KEY")


def test_google_expired_token_refresh_updates_token_and_marks_healthy(db_session):
    org = _org(db_session)
    connection = _connection(db_session, org, expired=True)
    service = GbpConnectionService(db_session)

    token = service.ensure_access_token(
        connection,
        refresh_callback=lambda refresh_token: {"access_token": "new-access-token", "expires_in": 3600},
    )

    db_session.refresh(connection)
    assert token == "new-access-token"
    assert connection.status == GbpConnectionStatus.CONNECTED
    health = IntegrationHealthService(db_session).list_incidents(integration="google_business_profile")
    assert all(row.status == "recovered" for row in health)


def test_google_refresh_failure_creates_reconnect_prompt_and_pauses(db_session):
    org = _org(db_session)
    connection = _connection(db_session, org, expired=True)

    try:
        GbpConnectionService(db_session).ensure_access_token(
            connection,
            refresh_callback=lambda refresh_token: (_ for _ in ()).throw(RuntimeError("invalid_grant revoked token refresh_token=secret")),
        )
    except ValueError:
        pass

    db_session.refresh(org)
    prompt = db_session.query(ClientReconnectPrompt).filter_by(tenant_id=org.id, status="active").one()
    incident = db_session.query(IntegrationIncident).filter_by(tenant_id=org.id, integration="google_business_profile").first()
    assert prompt.integration == "google_business_profile"
    assert org.posting_paused is True
    assert incident is not None
    assert incident.category == "token_refresh_failed"
    assert "secret" not in str(incident.safe_details)


def test_tenant_health_check_prompts_and_pauses_when_gbp_missing(db_session):
    org = _org(db_session)

    result = IntegrationHealthCheckRunner(db_session).run_tenant_integration_health_check(org.id)

    db_session.refresh(org)
    prompt = db_session.query(ClientReconnectPrompt).filter_by(tenant_id=org.id, status="active").one()
    assert result["google_business_profile"]["status"] == "missing"
    assert prompt.integration == "google_business_profile"
    assert org.posting_paused is True


def test_health_check_alerts_when_unsigned_twilio_webhooks_enabled(db_session, monkeypatch):
    monkeypatch.setattr(settings, "ALLOW_UNSIGNED_TWILIO_WEBHOOKS", True)

    result = IntegrationHealthCheckRunner(db_session).run_platform_health_check()

    health = db_session.query(IntegrationHealthCheck).filter_by(integration="twilio", module="lead_recovery_webhooks").one()
    incident = db_session.query(IntegrationIncident).filter_by(integration="twilio", module="lead_recovery_webhooks").one()
    assert result["config"]["twilio_webhooks"]["status"] == "unsigned_webhooks_enabled"
    assert health.status == "misconfigured"
    assert health.severity == "critical"
    assert incident.category == "secret_invalid"


def test_client_prompt_is_tenant_scoped(api_client, db_session):
    org_a = _org(db_session, "Tenant A")
    org_b = _org(db_session, "Tenant B")
    user = _member(db_session, org_a)
    IntegrationHealthService(db_session).create_client_reconnect_prompt(tenant_id=org_a.id)
    IntegrationHealthService(db_session).create_client_reconnect_prompt(tenant_id=org_b.id)

    allowed = api_client.get(f"/api/client/health/prompts?organization_id={org_a.id}&user_id={user.id}")
    denied = api_client.get(f"/api/client/health/prompts?organization_id={org_b.id}&user_id={user.id}")

    assert allowed.status_code == 200
    assert len(allowed.json()["rows"]) == 1
    assert allowed.json()["rows"][0]["tenant_id"] == str(org_a.id)
    assert denied.status_code == 403


def test_admin_health_endpoints_require_staff(api_client, db_session):
    org = _org(db_session)
    user = _member(db_session, org, "not-admin-health@example.com")

    staff_response = api_client.get("/api/admin/health/overview")
    non_staff_response = api_client.get(f"/api/admin/health/overview?user_id={user.id}")

    assert staff_response.status_code == 200
    assert non_staff_response.status_code == 403


def test_repeated_failure_updates_existing_incident(db_session):
    service = IntegrationHealthService(db_session)
    for _ in range(2):
        service.record_failure(
            tenant_id=None,
            integration="openai",
            module="gbp_posts",
            operation="generate",
            error=RuntimeError("rate limited"),
            force_category="rate_limited",
            force_severity="warning",
        )

    rows = db_session.query(IntegrationIncident).filter_by(integration="openai", module="gbp_posts", category="rate_limited").all()
    assert len(rows) == 1
    assert rows[0].affected_count == 2


def test_resume_automation_does_not_unpause_inactive_org(db_session):
    org = _org(db_session)
    org.is_active = False
    org.posting_paused = True
    db_session.add(org)
    db_session.commit()

    service = IntegrationHealthService(db_session)
    service.pause_tenant_module_automation(tenant_id=org.id, module="gbp", reason="GBP disconnected")
    service.resume_tenant_module_automation(tenant_id=org.id, module="gbp")

    db_session.refresh(org)
    assert org.is_active is False
    assert org.posting_paused is True

from __future__ import annotations

import pytest

from backend.app.core.config import settings
from backend.app.features.lead_recovery import router as lead_recovery_router
from backend.app.features.lead_recovery.service import LeadRecoveryService
from backend.app.models.enums import MembershipRole, OrganizationType
from backend.app.models.identity.membership import Membership
from backend.app.models.identity.organization import Organization
from backend.app.models.identity.user import User
from backend.app.models.lead_recovery import Lead, LeadEvent
from backend.app.models.reviews.review_request import ReviewRequest


@pytest.fixture(autouse=True)
def _disable_twilio_signature_for_local_tests(monkeypatch):
    monkeypatch.setattr(settings, "TWILIO_AUTH_TOKEN", "")
    monkeypatch.setattr(settings, "ALLOW_UNSIGNED_TWILIO_WEBHOOKS", True)


def _org(db_session, name: str = "Lead Org") -> Organization:
    org = Organization(name=name, org_type=OrganizationType.BUSINESS)
    db_session.add(org)
    db_session.commit()
    return org


def _member(db_session, org: Organization, email: str = "owner@example.com") -> User:
    user = User(email=email, is_staff=False)
    db_session.add(user)
    db_session.flush()
    db_session.add(Membership(user_id=user.id, organization_id=org.id, role=MembershipRole.OWNER))
    db_session.commit()
    return user


def _enable_settings(db_session, org: Organization, *, owner_phone: str | None = None):
    service = LeadRecoveryService(db_session)
    return service.update_settings(
        org.id,
        {
            "enabled": True,
            "twilio_phone_number": "+15550009999",
            "owner_notification_phone": owner_phone,
            "forwarding_status": "active",
        },
    )


def test_tenant_user_can_fetch_only_own_lead_recovery_settings(api_client, db_session):
    org_a = _org(db_session, "A")
    org_b = _org(db_session, "B")
    user = _member(db_session, org_a)

    allowed = api_client.get(f"/api/lead-recovery/settings?organization_id={org_a.id}&user_id={user.id}")
    denied = api_client.get(f"/api/lead-recovery/settings?organization_id={org_b.id}&user_id={user.id}")

    assert allowed.status_code == 200
    assert allowed.json()["tenant_id"] == str(org_a.id)
    assert denied.status_code == 403


def test_twilio_voice_webhook_maps_call_to_tenant_and_sends_first_sms(api_client, db_session, monkeypatch):
    org = _org(db_session)
    _enable_settings(db_session, org)
    sent: list[tuple[str, str]] = []
    monkeypatch.setattr(
        LeadRecoveryService,
        "_send_sms",
        lambda self, setting, *, to_number, body: sent.append((to_number, body)) or "SM-first",
    )

    response = api_client.post(
        "/api/webhooks/twilio/voice",
        data={"To": "+15550009999", "From": "+15551234567", "CallSid": "CA-1"},
    )

    assert response.status_code == 200
    lead = db_session.query(Lead).filter(Lead.tenant_id == org.id).one()
    assert lead.customer_phone == "+15551234567"
    assert lead.status == "auto_contacted"
    assert sent == [("+15551234567", "Hi, this is Lead Org. Sorry we missed your call. What can we help you with today?")]


def test_twilio_voice_webhook_rejects_invalid_signature(api_client, db_session, monkeypatch):
    class RejectingValidator:
        def __init__(self, token):
            self.token = token

        def validate(self, url, form, signature):
            return False

    monkeypatch.setattr(settings, "TWILIO_AUTH_TOKEN", "secret")
    monkeypatch.setattr(lead_recovery_router, "RequestValidator", RejectingValidator)
    org = _org(db_session)
    _enable_settings(db_session, org)

    response = api_client.post(
        "/api/webhooks/twilio/voice",
        data={"To": "+15550009999", "From": "+15551234567", "CallSid": "CA-bad-signature"},
        headers={"X-Twilio-Signature": "invalid"},
    )

    assert response.status_code == 403
    assert db_session.query(Lead).filter(Lead.tenant_id == org.id).count() == 0


def test_twilio_voice_webhook_requires_signature_configuration(api_client, db_session, monkeypatch):
    monkeypatch.setattr(settings, "TWILIO_AUTH_TOKEN", "")
    monkeypatch.setattr(settings, "ALLOW_UNSIGNED_TWILIO_WEBHOOKS", False)
    org = _org(db_session)
    _enable_settings(db_session, org)

    response = api_client.post(
        "/api/webhooks/twilio/voice",
        data={"To": "+15550009999", "From": "+15551234567", "CallSid": "CA-no-token"},
    )

    assert response.status_code == 500
    assert db_session.query(Lead).filter(Lead.tenant_id == org.id).count() == 0


def test_twilio_voice_webhook_verifies_pending_forwarding_without_creating_lead(api_client, db_session, monkeypatch):
    org = _org(db_session)
    LeadRecoveryService(db_session).update_settings(
        org.id,
        {
            "enabled": True,
            "business_phone": "+15551112222",
            "owner_notification_phone": "+15557654321",
            "twilio_phone_number": "+15550009999",
            "forwarding_status": "waiting_for_verification",
            "verification_status": "pending",
            "consent_confirmed": True,
        },
    )
    sent: list[str] = []
    monkeypatch.setattr(
        LeadRecoveryService,
        "_send_sms",
        lambda self, setting, *, to_number, body: sent.append(body) or "SM-unexpected",
    )

    response = api_client.post(
        "/api/webhooks/twilio/voice",
        data={"To": "+15550009999", "From": "+15551234567", "CallSid": "CA-verify"},
    )

    assert response.status_code == 200
    assert response.headers["X-Lead-Recovery-Result"] == "verification_verified"
    assert db_session.query(Lead).filter(Lead.tenant_id == org.id).count() == 0
    setting = LeadRecoveryService(db_session).get_or_create_settings(org.id)
    assert setting.forwarding_status == "verified"
    assert setting.verification_status == "verified"
    assert setting.last_test_call_sid == "CA-verify"
    assert sent == []
    assert (
        db_session.query(LeadEvent)
        .filter(LeadEvent.tenant_id == org.id, LeadEvent.event_type == "lead_recovery_verification_verified")
        .first()
        is not None
    )


def test_real_forwarded_call_after_verification_creates_lead(api_client, db_session, monkeypatch):
    org = _org(db_session)
    LeadRecoveryService(db_session).update_settings(
        org.id,
        {
            "enabled": True,
            "twilio_phone_number": "+15550009999",
            "forwarding_status": "verified",
            "verification_status": "verified",
        },
    )
    monkeypatch.setattr(LeadRecoveryService, "_send_sms", lambda self, setting, *, to_number, body: "SM-first")

    response = api_client.post(
        "/api/webhooks/twilio/voice",
        data={"To": "+15550009999", "From": "+15551234567", "CallSid": "CA-real"},
    )

    assert response.status_code == 200
    lead = db_session.query(Lead).filter(Lead.tenant_id == org.id).one()
    assert lead.customer_phone == "+15551234567"
    assert lead.status == "auto_contacted"


def test_duplicate_call_sid_is_idempotent(api_client, db_session, monkeypatch):
    org = _org(db_session)
    _enable_settings(db_session, org)
    sent: list[str] = []
    monkeypatch.setattr(
        LeadRecoveryService,
        "_send_sms",
        lambda self, setting, *, to_number, body: sent.append(body) or "SM-first",
    )

    for _ in range(2):
        response = api_client.post(
            "/api/webhooks/twilio/voice",
            data={"To": "+15550009999", "From": "+15551234567", "CallSid": "CA-duplicate"},
        )
        assert response.status_code == 200

    assert db_session.query(Lead).filter(Lead.tenant_id == org.id).count() == 1
    assert len(sent) == 1
    assert (
        db_session.query(LeadEvent)
        .filter(LeadEvent.tenant_id == org.id, LeadEvent.event_type == "missed_call_received")
        .count()
        == 1
    )


def test_inbound_sms_updates_lead_and_asks_next_question(api_client, db_session, monkeypatch):
    org = _org(db_session)
    _enable_settings(db_session, org)
    sent: list[str] = []
    monkeypatch.setattr(
        LeadRecoveryService,
        "_send_sms",
        lambda self, setting, *, to_number, body: sent.append(body) or "SM-out",
    )
    api_client.post(
        "/api/webhooks/twilio/voice",
        data={"To": "+15550009999", "From": "+15551234567", "CallSid": "CA-2"},
    )

    response = api_client.post(
        "/api/webhooks/twilio/sms/inbound",
        data={"To": "+15550009999", "From": "+15551234567", "Body": "Need drain cleaning", "MessageSid": "SM-in-1"},
    )

    assert response.status_code == 200
    lead = db_session.query(Lead).filter(Lead.tenant_id == org.id).one()
    assert lead.service_requested == "Need drain cleaning"
    assert lead.status == "responded"
    assert sent[-1] == "What city or area are you located in?"


def test_stop_opt_out_prevents_future_auto_textback(api_client, db_session, monkeypatch):
    org = _org(db_session)
    _enable_settings(db_session, org)
    sent: list[str] = []
    monkeypatch.setattr(
        LeadRecoveryService,
        "_send_sms",
        lambda self, setting, *, to_number, body: sent.append(body) or "SM-out",
    )
    api_client.post(
        "/api/webhooks/twilio/voice",
        data={"To": "+15550009999", "From": "+15551234567", "CallSid": "CA-optout-1"},
    )
    api_client.post(
        "/api/webhooks/twilio/sms/inbound",
        data={"To": "+15550009999", "From": "+15551234567", "Body": "STOP", "MessageSid": "SM-stop"},
    )
    api_client.post(
        "/api/webhooks/twilio/voice",
        data={"To": "+15550009999", "From": "+15551234567", "CallSid": "CA-optout-2"},
    )

    assert len(sent) == 1
    assert db_session.query(Lead).filter(Lead.tenant_id == org.id).count() == 2


def test_owner_notification_sends_after_enough_info(api_client, db_session, monkeypatch):
    org = _org(db_session)
    _enable_settings(db_session, org, owner_phone="+15557654321")
    sent: list[tuple[str, str]] = []
    monkeypatch.setattr(
        LeadRecoveryService,
        "_send_sms",
        lambda self, setting, *, to_number, body: sent.append((to_number, body)) or "SM-out",
    )
    api_client.post(
        "/api/webhooks/twilio/voice",
        data={"To": "+15550009999", "From": "+15551234567", "CallSid": "CA-3"},
    )
    for idx, body in enumerate(["Drain cleaning", "Austin", "Today", "After 3pm", "Jamie"], start=1):
        api_client.post(
            "/api/webhooks/twilio/sms/inbound",
            data={"To": "+15550009999", "From": "+15551234567", "Body": body, "MessageSid": f"SM-info-{idx}"},
        )

    lead = db_session.query(Lead).filter(Lead.tenant_id == org.id).one()
    assert lead.status == "qualified"
    assert lead.customer_name == "Jamie"
    assert any(to == "+15557654321" and "New lead from missed call:" in body for to, body in sent)
    assert (
        db_session.query(LeadEvent)
        .filter(LeadEvent.lead_id == lead.id, LeadEvent.event_type == "owner_notified")
        .first()
        is not None
    )


def test_user_cannot_access_another_tenant_lead(api_client, db_session):
    org_a = _org(db_session, "A")
    org_b = _org(db_session, "B")
    user = _member(db_session, org_a)
    lead = Lead(tenant_id=org_b.id, customer_phone="+15551234567", status="new")
    db_session.add(lead)
    db_session.commit()

    response = api_client.get(f"/api/lead-recovery/leads/{lead.id}?organization_id={org_b.id}&user_id={user.id}")

    assert response.status_code == 403


def test_invalid_lead_status_is_rejected(api_client, db_session):
    org = _org(db_session)
    user = _member(db_session, org)
    lead = Lead(tenant_id=org.id, customer_phone="+15551234567", status="new")
    db_session.add(lead)
    db_session.commit()

    response = api_client.patch(
        f"/api/lead-recovery/leads/{lead.id}?organization_id={org.id}&user_id={user.id}",
        json={"status": "admin"},
    )

    assert response.status_code == 400
    db_session.refresh(lead)
    assert lead.status == "new"


def test_duplicate_twilio_number_assignment_is_rejected(db_session):
    org_a = _org(db_session, "A")
    org_b = _org(db_session, "B")
    service = LeadRecoveryService(db_session)
    service.update_settings(org_a.id, {"twilio_phone_number": "+15550009999"})

    with pytest.raises(ValueError, match="already assigned"):
        service.update_settings(org_b.id, {"twilio_phone_number": "+15550009999"})


def test_start_verification_requires_complete_settings(api_client, db_session):
    org = _org(db_session)
    user = _member(db_session, org)
    LeadRecoveryService(db_session).update_settings(org.id, {"enabled": True, "twilio_phone_number": "+15550009999"})

    response = api_client.post(
        f"/api/lead-recovery/settings/start-verification?organization_id={org.id}&user_id={user.id}",
        json={},
    )

    assert response.status_code == 409
    assert "Business phone" in response.json()["detail"]


def test_mark_completed_queues_review_request(api_client, db_session):
    org = _org(db_session)
    user = _member(db_session, org)
    LeadRecoveryService(db_session).update_settings(org.id, {"completed_job_review_request_enabled": True})
    lead = Lead(tenant_id=org.id, customer_name="Jamie", customer_phone="+15551234567", status="booked")
    db_session.add(lead)
    db_session.commit()

    response = api_client.post(f"/api/lead-recovery/leads/{lead.id}/mark-completed?organization_id={org.id}&user_id={user.id}")

    assert response.status_code == 200
    assert response.json()["status"] == "completed"
    assert db_session.query(ReviewRequest).count() == 1
    assert (
        db_session.query(LeadEvent)
        .filter(LeadEvent.lead_id == lead.id, LeadEvent.event_type == "review_request_queued")
        .first()
        is not None
    )

from __future__ import annotations

import logging
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session, selectinload

from backend.app.core.config import settings
from backend.app.models.identity.organization import Organization
from backend.app.models.lead_recovery import Lead, LeadEvent, LeadMessage, LeadNote, LeadRecoverySettings
from backend.app.services.operations.notifications import NotificationService
from backend.app.services.reviews.review_requests import ReviewRequestService

try:
    from twilio.rest import Client as TwilioClient
except ImportError:  # pragma: no cover
    TwilioClient = None

logger = logging.getLogger(__name__)

VALID_LEAD_STATUSES = {"new", "auto_contacted", "responded", "qualified", "contacted", "booked", "lost", "completed"}
OPEN_LEAD_STATUSES = {"new", "auto_contacted", "responded", "qualified", "contacted", "booked"}
VALID_FORWARDING_STATUSES = {"not_configured", "waiting_for_forwarding", "waiting_for_verification", "verified", "active", "failed", "error", "skipped"}
VALID_VERIFICATION_STATUSES = {"not_started", "pending", "verified", "failed", "skipped"}
STOP_KEYWORDS = {"stop", "unsubscribe", "cancel", "end", "quit"}
URGENT_WORDS = {"urgent", "emergency", "asap", "now", "today", "leak", "flood", "no heat", "no ac"}


class LeadRecoveryService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.notifier = NotificationService()

    def get_or_create_settings(self, tenant_id: uuid.UUID) -> LeadRecoverySettings:
        row = (
            self.db.query(LeadRecoverySettings)
            .filter(LeadRecoverySettings.tenant_id == tenant_id)
            .one_or_none()
        )
        if row:
            return row
        row = LeadRecoverySettings(
            tenant_id=tenant_id,
            enabled=False,
            forwarding_status="not_configured",
            verification_status="not_started",
            consent_confirmed=False,
            missed_call_textback_enabled=True,
            intake_questions_enabled=True,
            owner_notifications_enabled=True,
            no_response_followup_enabled=True,
            completed_job_review_request_enabled=True,
        )
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return row

    def update_settings(self, tenant_id: uuid.UUID, values: dict[str, Any]) -> LeadRecoverySettings:
        row = self.get_or_create_settings(tenant_id)
        if "twilio_phone_number" in values:
            normalized = normalize_phone(values.get("twilio_phone_number"))
            values["twilio_phone_number"] = normalized
            if normalized:
                self._ensure_twilio_number_available(tenant_id, normalized)
        if "twilio_phone_sid" in values and values.get("twilio_phone_sid"):
            self._ensure_twilio_sid_available(tenant_id, str(values["twilio_phone_sid"]))
        if "forwarding_status" in values and values["forwarding_status"] not in VALID_FORWARDING_STATUSES:
            raise ValueError("Invalid Lead Recovery forwarding status")
        if "verification_status" in values and values["verification_status"] not in VALID_VERIFICATION_STATUSES:
            raise ValueError("Invalid Lead Recovery verification status")
        allowed = {
            "enabled",
            "business_phone",
            "owner_notification_phone",
            "owner_notification_email",
            "business_name",
            "twilio_phone_number",
            "twilio_phone_sid",
            "forwarding_status",
            "verification_status",
            "last_verification_attempt_at",
            "verified_at",
            "test_call_from_phone",
            "last_test_call_sid",
            "consent_confirmed",
            "missed_call_textback_enabled",
            "intake_questions_enabled",
            "owner_notifications_enabled",
            "no_response_followup_enabled",
            "completed_job_review_request_enabled",
        }
        for key, value in values.items():
            if key in allowed:
                setattr(row, key, value)
        row.updated_at = datetime.now(timezone.utc)
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return row

    def assign_recovery_number(self, tenant_id: uuid.UUID) -> LeadRecoverySettings:
        row = self.get_or_create_settings(tenant_id)
        if row.twilio_phone_number:
            return row
        fallback_number = normalize_phone(settings.TWILIO_DEFAULT_FROM_NUMBER or settings.TWILIO_FROM_NUMBER)
        if not fallback_number:
            raise ValueError("No Twilio recovery number is configured for assignment")
        self._ensure_twilio_number_available(tenant_id, fallback_number)
        row.twilio_phone_number = fallback_number
        if row.enabled and row.forwarding_status in {"not_configured", "skipped"}:
            row.forwarding_status = "not_configured"
        row.updated_at = datetime.now(timezone.utc)
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return row

    def start_verification(self, tenant_id: uuid.UUID, *, test_call_from_phone: str | None = None) -> LeadRecoverySettings:
        row = self.get_or_create_settings(tenant_id)
        if not row.enabled:
            raise ValueError("Enable Lead Recovery before starting verification")
        if not row.business_phone:
            raise ValueError("Business phone is required before verification")
        if not row.owner_notification_phone and not row.owner_notification_email:
            raise ValueError("Owner notification phone or email is required before verification")
        if not row.consent_confirmed:
            raise ValueError("Forwarding setup confirmation is required before verification")
        if not row.twilio_phone_number:
            raise ValueError("Assign a recovery number before verification")
        row.forwarding_status = "waiting_for_verification"
        row.verification_status = "pending"
        row.last_verification_attempt_at = datetime.now(timezone.utc)
        if test_call_from_phone is not None:
            row.test_call_from_phone = normalize_phone(test_call_from_phone)
        row.updated_at = datetime.now(timezone.utc)
        self.db.add(row)
        self._add_event(
            tenant_id=tenant_id,
            lead_id=None,
            event_type="lead_recovery_verification_started",
            payload={"test_call_from_phone": row.test_call_from_phone},
        )
        self.db.commit()
        self.db.refresh(row)
        return row

    def skip_setup(self, tenant_id: uuid.UUID) -> LeadRecoverySettings:
        row = self.get_or_create_settings(tenant_id)
        row.enabled = False
        row.forwarding_status = "skipped"
        row.verification_status = "skipped"
        row.updated_at = datetime.now(timezone.utc)
        self.db.add(row)
        self._add_event(tenant_id=tenant_id, lead_id=None, event_type="lead_recovery_setup_skipped", payload={})
        self.db.commit()
        self.db.refresh(row)
        return row

    def list_leads(self, tenant_id: uuid.UUID, *, limit: int = 100) -> list[Lead]:
        return (
            self.db.query(Lead)
            .options(selectinload(Lead.messages))
            .filter(Lead.tenant_id == tenant_id)
            .order_by(Lead.last_message_at.desc().nullslast(), Lead.created_at.desc())
            .limit(limit)
            .all()
        )

    def get_lead(self, tenant_id: uuid.UUID, lead_id: uuid.UUID) -> Lead | None:
        return (
            self.db.query(Lead)
            .options(selectinload(Lead.messages), selectinload(Lead.notes), selectinload(Lead.events))
            .filter(Lead.tenant_id == tenant_id, Lead.id == lead_id)
            .one_or_none()
        )

    def update_lead(self, tenant_id: uuid.UUID, lead_id: uuid.UUID, values: dict[str, Any]) -> Lead | None:
        lead = self.get_lead(tenant_id, lead_id)
        if not lead:
            return None
        if "status" in values and values["status"] not in VALID_LEAD_STATUSES:
            raise ValueError("Invalid lead status")
        allowed = {
            "customer_name",
            "customer_email",
            "service_requested",
            "location",
            "urgency",
            "preferred_time",
            "details",
            "status",
            "owner_summary",
        }
        for key, value in values.items():
            if key in allowed:
                setattr(lead, key, value)
        lead.updated_at = datetime.now(timezone.utc)
        self.db.add(lead)
        self.db.commit()
        self.db.refresh(lead)
        return lead

    def add_note(self, tenant_id: uuid.UUID, lead_id: uuid.UUID, note: str, created_by: uuid.UUID | None) -> LeadNote:
        lead = self.get_lead(tenant_id, lead_id)
        if not lead:
            raise ValueError("Lead not found")
        row = LeadNote(tenant_id=tenant_id, lead_id=lead_id, note=note.strip(), created_by=created_by)
        self.db.add(row)
        self._add_event(tenant_id=tenant_id, lead_id=lead_id, event_type="note_added", payload={"created_by": str(created_by) if created_by else None})
        self.db.commit()
        self.db.refresh(row)
        return row

    def set_status(self, tenant_id: uuid.UUID, lead_id: uuid.UUID, status: str) -> Lead | None:
        if status not in VALID_LEAD_STATUSES:
            raise ValueError("Invalid lead status")
        lead = self.update_lead(tenant_id, lead_id, {"status": status})
        if not lead:
            return None
        self._add_event(tenant_id=tenant_id, lead_id=lead.id, event_type=f"lead_marked_{status}", payload={})
        if status == "completed":
            self._maybe_queue_review_request(lead)
        self.db.commit()
        self.db.refresh(lead)
        return lead

    def handle_missed_call(self, *, called_number: str | None, caller_number: str | None, call_sid: str | None) -> tuple[Lead | None, str]:
        setting = self._settings_for_twilio(to_number=called_number, to_sid=None)
        if not setting or not setting.enabled or not settings.LEAD_RECOVERY_ENABLED:
            return None, "not_configured"
        self._set_tenant_context(setting.tenant_id)
        caller_phone = normalize_phone(caller_number)
        if self._is_pending_verification(setting):
            return self._verify_forwarding_call(setting, caller_phone=caller_phone, called_number=called_number, call_sid=call_sid)
        if not caller_phone:
            self._add_event(
                tenant_id=setting.tenant_id,
                lead_id=None,
                event_type="missed_call_ignored",
                payload={"reason": "missing_caller_phone", "call_sid": call_sid},
            )
            self.db.commit()
            return None, "ignored"
        if call_sid and self._event_exists(setting.tenant_id, "missed_call_received", call_sid):
            return None, "duplicate"
        lead = self._find_or_create_open_lead(setting.tenant_id, caller_phone, source="missed_call")
        self._add_message(
            tenant_id=setting.tenant_id,
            lead_id=lead.id,
            direction="inbound",
            channel="voice",
            body=f"Missed forwarded call from {caller_phone}",
            twilio_message_sid=call_sid,
        )
        self._add_event(
            tenant_id=setting.tenant_id,
            lead_id=lead.id,
            event_type="missed_call_received",
            payload={"call_sid": call_sid, "called": called_number},
        )
        if setting.missed_call_textback_enabled and not self._phone_has_opted_out(setting.tenant_id, caller_phone):
            body = self._first_sms(setting.tenant_id)
            sid = self._send_sms(setting, to_number=caller_phone, body=body)
            self._add_message(
                tenant_id=setting.tenant_id,
                lead_id=lead.id,
                direction="outbound",
                channel="sms",
                body=body,
                twilio_message_sid=sid,
            )
            lead.status = "auto_contacted"
        lead.last_message_at = datetime.now(timezone.utc)
        self.db.add(lead)
        self.db.commit()
        self.db.refresh(lead)
        return lead, "created"

    def _is_pending_verification(self, setting: LeadRecoverySettings) -> bool:
        return setting.forwarding_status == "waiting_for_verification" or setting.verification_status == "pending"

    def _verify_forwarding_call(
        self,
        setting: LeadRecoverySettings,
        *,
        caller_phone: str | None,
        called_number: str | None,
        call_sid: str | None,
    ) -> tuple[Lead | None, str]:
        if call_sid and self._event_exists(setting.tenant_id, "lead_recovery_verification_call_received", call_sid):
            return None, "verification_duplicate"
        now = datetime.now(timezone.utc)
        setting.forwarding_status = "verified"
        setting.verification_status = "verified"
        setting.verified_at = now
        setting.last_test_call_sid = call_sid
        setting.updated_at = now
        self.db.add(setting)
        self._add_event(
            tenant_id=setting.tenant_id,
            lead_id=None,
            event_type="lead_recovery_verification_call_received",
            payload={"call_sid": call_sid, "from_phone": caller_phone, "to_phone": normalize_phone(called_number)},
        )
        self._add_event(
            tenant_id=setting.tenant_id,
            lead_id=None,
            event_type="lead_recovery_verification_verified",
            payload={"call_sid": call_sid},
        )
        self.db.commit()
        self.db.refresh(setting)
        return None, "verification_verified"

    def handle_inbound_sms(
        self, *, to_number: str | None, from_number: str | None, body: str | None, message_sid: str | None
    ) -> tuple[Lead | None, str, str | None]:
        setting = self._settings_for_twilio(to_number=to_number, to_sid=None)
        if not setting or not setting.enabled or not settings.LEAD_RECOVERY_ENABLED:
            return None, "not_configured", None
        self._set_tenant_context(setting.tenant_id)
        customer_phone = normalize_phone(from_number)
        text = (body or "").strip()
        if not customer_phone:
            return None, "ignored", None
        if message_sid and self._message_exists(setting.tenant_id, message_sid):
            return self._find_open_lead(setting.tenant_id, customer_phone), "duplicate", None
        lead = self._find_or_create_open_lead(setting.tenant_id, customer_phone, source="sms")
        self._add_message(
            tenant_id=setting.tenant_id,
            lead_id=lead.id,
            direction="inbound",
            channel="sms",
            body=text,
            twilio_message_sid=message_sid,
        )
        if text.lower() in STOP_KEYWORDS:
            self._add_event(tenant_id=setting.tenant_id, lead_id=lead.id, event_type="customer_opted_out", payload={"keyword": text})
            lead.status = "lost"
            lead.last_message_at = datetime.now(timezone.utc)
            self.db.add(lead)
            self.db.commit()
            return lead, "opted_out", None

        self._apply_customer_reply(lead, text)
        response = None
        if setting.intake_questions_enabled:
            response = self._next_question(lead)
        enough_info = self._has_enough_info(lead)
        urgent = self._looks_urgent(text)
        if enough_info:
            lead.status = "qualified"
            response = "Thanks, we sent your information to the team. Someone will follow up with you soon."
        elif lead.status in {"new", "auto_contacted"}:
            lead.status = "responded"
        if response and not self._is_opted_out(lead):
            sid = self._send_sms(setting, to_number=customer_phone, body=response)
            self._add_message(
                tenant_id=setting.tenant_id,
                lead_id=lead.id,
                direction="outbound",
                channel="sms",
                body=response,
                twilio_message_sid=sid,
            )
        if (enough_info or urgent) and setting.owner_notifications_enabled:
            self._notify_owner(setting, lead)
        lead.last_message_at = datetime.now(timezone.utc)
        self.db.add(lead)
        self.db.commit()
        self.db.refresh(lead)
        return lead, "processed", response

    def _settings_for_twilio(self, *, to_number: str | None, to_sid: str | None) -> LeadRecoverySettings | None:
        normalized = normalize_phone(to_number)
        query = self.db.query(LeadRecoverySettings)
        if to_sid:
            row = query.filter(LeadRecoverySettings.twilio_phone_sid == to_sid).one_or_none()
            if row:
                return row
        if normalized:
            return query.filter(LeadRecoverySettings.twilio_phone_number == normalized).one_or_none()
        return None

    def _ensure_twilio_number_available(self, tenant_id: uuid.UUID, twilio_phone_number: str) -> None:
        existing = (
            self.db.query(LeadRecoverySettings)
            .filter(
                LeadRecoverySettings.tenant_id != tenant_id,
                LeadRecoverySettings.twilio_phone_number == twilio_phone_number,
            )
            .first()
        )
        if existing:
            raise ValueError("Twilio recovery number is already assigned to another tenant")

    def _ensure_twilio_sid_available(self, tenant_id: uuid.UUID, twilio_phone_sid: str) -> None:
        existing = (
            self.db.query(LeadRecoverySettings)
            .filter(
                LeadRecoverySettings.tenant_id != tenant_id,
                LeadRecoverySettings.twilio_phone_sid == twilio_phone_sid,
            )
            .first()
        )
        if existing:
            raise ValueError("Twilio phone SID is already assigned to another tenant")

    def _set_tenant_context(self, tenant_id: uuid.UUID) -> None:
        if self.db.bind and self.db.bind.dialect.name == "postgresql":
            self.db.execute(text("SET LOCAL app.current_org = :org_id"), {"org_id": str(tenant_id)})

    def _find_or_create_open_lead(self, tenant_id: uuid.UUID, customer_phone: str, *, source: str) -> Lead:
        lead = self._find_open_lead(tenant_id, customer_phone)
        if lead:
            return lead
        lead = Lead(tenant_id=tenant_id, source=source, customer_phone=customer_phone, status="new")
        self.db.add(lead)
        self.db.flush()
        self._add_event(tenant_id=tenant_id, lead_id=lead.id, event_type="lead_created", payload={"source": source})
        return lead

    def _find_open_lead(self, tenant_id: uuid.UUID, customer_phone: str) -> Lead | None:
        cutoff = datetime.now(timezone.utc) - timedelta(days=30)
        return (
            self.db.query(Lead)
            .filter(
                Lead.tenant_id == tenant_id,
                Lead.customer_phone == customer_phone,
                Lead.status.in_(OPEN_LEAD_STATUSES),
                Lead.created_at >= cutoff,
            )
            .order_by(Lead.created_at.desc())
            .first()
        )

    def _apply_customer_reply(self, lead: Lead, text: str) -> None:
        if not lead.details:
            lead.details = text
        elif text not in lead.details:
            lead.details = f"{lead.details}\n{text}"
        if not lead.service_requested:
            lead.service_requested = text[:255]
            return
        if not lead.location:
            lead.location = text[:255]
            return
        if not lead.urgency:
            lead.urgency = text[:120]
            return
        if not lead.preferred_time:
            lead.preferred_time = text[:255]
            return
        if not lead.customer_name:
            lead.customer_name = text[:255]

    def _next_question(self, lead: Lead) -> str | None:
        if not lead.service_requested:
            return "What service are you looking for?"
        if not lead.location:
            return "What city or area are you located in?"
        if not lead.urgency:
            return "Is this urgent, or can it be scheduled for a later time?"
        if not lead.preferred_time:
            return "What day or time works best for a call back?"
        if not lead.customer_name:
            return "Thanks. What name should we give the team?"
        return None

    def _has_enough_info(self, lead: Lead) -> bool:
        return bool(lead.service_requested and lead.location and lead.urgency and lead.preferred_time and lead.customer_name)

    def _notify_owner(self, setting: LeadRecoverySettings, lead: Lead) -> None:
        summary = self._owner_summary(lead)
        if lead.owner_summary == summary and self._event_type_exists(lead.tenant_id, lead.id, "owner_notified"):
            return
        lead.owner_summary = summary
        if setting.owner_notification_phone:
            sid = self._send_sms(setting, to_number=setting.owner_notification_phone, body=summary)
            self._add_message(
                tenant_id=lead.tenant_id,
                lead_id=lead.id,
                direction="outbound",
                channel="sms",
                body=f"Owner notification sent to {mask_phone(setting.owner_notification_phone)}",
                twilio_message_sid=sid,
            )
        if setting.owner_notification_email:
            self.notifier.send_email(
                to_email=setting.owner_notification_email,
                subject="New missed-call lead",
                html_body=summary.replace("\n", "<br />"),
                text_body=summary,
            )
        self._add_event(tenant_id=lead.tenant_id, lead_id=lead.id, event_type="owner_notified", payload={})

    def _owner_summary(self, lead: Lead) -> str:
        return (
            "New lead from missed call:\n"
            f"Name: {lead.customer_name or 'Unknown'}\n"
            f"Phone: {lead.customer_phone or 'Unknown'}\n"
            f"Service: {lead.service_requested or 'Unknown'}\n"
            f"Location: {lead.location or 'Unknown'}\n"
            f"Urgency: {lead.urgency or 'Unknown'}\n"
            f"Preferred time: {lead.preferred_time or 'Unknown'}\n"
            f"Details: {self._details_summary(lead)}\n"
            "Suggested action: Follow up as soon as possible."
        )

    def _details_summary(self, lead: Lead) -> str:
        messages = [
            message.body.strip()
            for message in sorted(lead.messages, key=lambda item: item.created_at or datetime.min)
            if message.direction == "inbound" and message.channel == "sms" and message.body
        ]
        return " | ".join(messages[-4:]) or lead.details or "Unknown"

    def _first_sms(self, tenant_id: uuid.UUID) -> str:
        setting = self.get_or_create_settings(tenant_id)
        configured_name = (setting.business_name or "").strip()
        if configured_name:
            return f"Hi, this is {configured_name}. Sorry we missed your call. What can we help you with today?"
        org = self.db.get(Organization, tenant_id)
        business_name = (org.name if org else "").strip()
        if business_name:
            return f"Hi, this is {business_name}. Sorry we missed your call. What can we help you with today?"
        return "Hi, sorry we missed your call. What can we help you with today?"

    def _send_sms(self, setting: LeadRecoverySettings, *, to_number: str, body: str) -> str | None:
        account_sid = settings.TWILIO_ACCOUNT_SID
        auth_token = settings.TWILIO_AUTH_TOKEN
        from_number = settings.TWILIO_DEFAULT_FROM_NUMBER or settings.TWILIO_FROM_NUMBER or setting.twilio_phone_number
        if not (account_sid and auth_token and TwilioClient is not None):
            logger.info("Twilio credentials are not configured; lead recovery SMS skipped")
            return None
        client = TwilioClient(account_sid, auth_token)
        payload: dict[str, str] = {"to": to_number, "body": body}
        if settings.TWILIO_MESSAGING_SERVICE_SID:
            payload["messaging_service_sid"] = settings.TWILIO_MESSAGING_SERVICE_SID
        elif from_number:
            payload["from_"] = from_number
        else:
            logger.warning("No Twilio sender configured; lead recovery SMS skipped")
            return None
        message = client.messages.create(**payload)
        return getattr(message, "sid", None)

    def _maybe_queue_review_request(self, lead: Lead) -> None:
        setting = self.get_or_create_settings(lead.tenant_id)
        if not setting.completed_job_review_request_enabled or not lead.customer_phone:
            return
        try:
            service = ReviewRequestService(self.db)
            contact = service.create_contact(
                organization_id=lead.tenant_id,
                location_id=None,
                name=lead.customer_name or "Lead Recovery customer",
                phone=lead.customer_phone,
                email=lead.customer_email,
            )
            job = service.create_job(
                organization_id=lead.tenant_id,
                location_id=None,
                contact_id=contact.id,
                payload={"source": "lead_recovery", "lead_id": str(lead.id)},
            )
            review_request = service.queue_review_request(
                organization_id=lead.tenant_id,
                location_id=None,
                contact_id=contact.id,
                job_id=job.id,
                channel="sms",
            )
            self._add_event(
                tenant_id=lead.tenant_id,
                lead_id=lead.id,
                event_type="review_request_queued",
                payload={"review_request_id": str(review_request.id)},
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception("Unable to queue lead recovery review request for lead %s: %s", lead.id, exc)

    def _add_message(
        self,
        *,
        tenant_id: uuid.UUID,
        lead_id: uuid.UUID,
        direction: str,
        channel: str,
        body: str | None,
        twilio_message_sid: str | None = None,
    ) -> LeadMessage:
        row = LeadMessage(
            tenant_id=tenant_id,
            lead_id=lead_id,
            direction=direction,
            channel=channel,
            body=body,
            twilio_message_sid=twilio_message_sid,
        )
        self.db.add(row)
        return row

    def _add_event(
        self, *, tenant_id: uuid.UUID, lead_id: uuid.UUID | None, event_type: str, payload: dict[str, Any] | None
    ) -> LeadEvent:
        row = LeadEvent(tenant_id=tenant_id, lead_id=lead_id, event_type=event_type, payload=payload or {})
        self.db.add(row)
        return row

    def _message_exists(self, tenant_id: uuid.UUID, sid: str) -> bool:
        return (
            self.db.query(LeadMessage)
            .filter(LeadMessage.tenant_id == tenant_id, LeadMessage.twilio_message_sid == sid)
            .first()
            is not None
        )

    def _event_exists(self, tenant_id: uuid.UUID, event_type: str, sid: str) -> bool:
        events = (
            self.db.query(LeadEvent)
            .filter(LeadEvent.tenant_id == tenant_id, LeadEvent.event_type == event_type)
            .order_by(LeadEvent.created_at.desc())
            .limit(50)
            .all()
        )
        return any((event.payload or {}).get("call_sid") == sid for event in events)

    def _event_type_exists(self, tenant_id: uuid.UUID, lead_id: uuid.UUID, event_type: str) -> bool:
        return (
            self.db.query(LeadEvent)
            .filter(LeadEvent.tenant_id == tenant_id, LeadEvent.lead_id == lead_id, LeadEvent.event_type == event_type)
            .first()
            is not None
        )

    def _is_opted_out(self, lead: Lead) -> bool:
        return self._event_type_exists(lead.tenant_id, lead.id, "customer_opted_out")

    def _phone_has_opted_out(self, tenant_id: uuid.UUID, customer_phone: str) -> bool:
        return (
            self.db.query(LeadEvent)
            .join(Lead, Lead.id == LeadEvent.lead_id)
            .filter(
                LeadEvent.tenant_id == tenant_id,
                LeadEvent.event_type == "customer_opted_out",
                Lead.customer_phone == customer_phone,
            )
            .first()
            is not None
        )

    def _looks_urgent(self, text: str) -> bool:
        normalized = text.lower()
        return any(word in normalized for word in URGENT_WORDS)


def normalize_phone(raw: str | None) -> str | None:
    if not raw:
        return None
    phone = re.sub(r"[\s().-]+", "", raw.strip())
    if re.fullmatch(r"\+[1-9]\d{7,14}", phone):
        return phone
    if re.fullmatch(r"\d{10}", phone):
        return f"+1{phone}"
    return phone if phone.startswith("+") else None


def mask_phone(raw: str) -> str:
    value = normalize_phone(raw) or raw
    return f"...{value[-4:]}" if len(value) > 4 else "configured phone"

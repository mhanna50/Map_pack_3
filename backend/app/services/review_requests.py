from __future__ import annotations

from datetime import datetime, timedelta, timezone
import logging
import uuid

import httpx
from sqlalchemy.orm import Session

from backend.app.core.config import settings
from backend.app.models.contact import Contact
from backend.app.models.enums import ReviewRequestStatus, ActionType
from backend.app.models.job import Job
from backend.app.models.review_request import ReviewRequest
from backend.app.services.actions import ActionService
from backend.app.services.audit import AuditService
from backend.app.services.notifications import NotificationService

logger = logging.getLogger(__name__)


class ReviewRequestService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.actions = ActionService(db)
        self.audit = AuditService(db)
        self.notifier = NotificationService()

    def create_contact(
        self,
        *,
        organization_id: uuid.UUID,
        name: str,
        phone: str | None,
        email: str | None,
        location_id: uuid.UUID | None = None,
    ) -> Contact:
        contact = Contact(
            organization_id=organization_id,
            location_id=location_id,
            name=name,
            phone=phone,
            email=email,
        )
        self.db.add(contact)
        self.db.commit()
        self.db.refresh(contact)
        return contact

    def create_job(
        self,
        *,
        organization_id: uuid.UUID,
        contact_id: uuid.UUID,
        location_id: uuid.UUID | None = None,
        completed_at: datetime | None = None,
        job_type: str = "field_service",
        status: str = "completed",
        payload: dict | None = None,
    ) -> Job:
        timestamp = completed_at or datetime.now(timezone.utc)
        job = Job(
            organization_id=organization_id,
            contact_id=contact_id,
            location_id=location_id,
            job_type=job_type,
            status=status,
            payload_json=payload or {"contact_id": str(contact_id)},
            run_at=timestamp,
            started_at=timestamp,
            finished_at=timestamp if status == "completed" else None,
        )
        self.db.add(job)
        self.db.commit()
        self.db.refresh(job)
        return job

    def queue_review_request(
        self,
        *,
        organization_id: uuid.UUID,
        contact_id: uuid.UUID,
        job_id: uuid.UUID | None,
        channel: str,
        send_at: datetime | None = None,
    ) -> ReviewRequest:
        request = ReviewRequest(
            organization_id=organization_id,
            contact_id=contact_id,
            job_id=job_id,
            channel=channel,
            status=ReviewRequestStatus.PENDING,
        )
        self.db.add(request)
        self.db.commit()
        scheduled_for = send_at or datetime.now(timezone.utc)
        self.actions.schedule_action(
            organization_id=organization_id,
            action_type=ActionType.CUSTOM,
            run_at=scheduled_for,
            payload={"review_request_id": str(request.id)},
        )
        self.audit.log(
            action="review_request.scheduled",
            organization_id=organization_id,
            entity_type="review_request",
            entity_id=str(request.id),
            metadata={"review_request_id": str(request.id)},
        )
        if scheduled_for <= datetime.now(timezone.utc):
            self._deliver_request(request)
        return request

    def mark_sent(self, review_request: ReviewRequest) -> ReviewRequest:
        review_request.status = ReviewRequestStatus.SENT
        review_request.sent_at = datetime.now(timezone.utc)
        self.db.add(review_request)
        self.db.commit()
        return review_request

    def mark_completed(self, review_request: ReviewRequest) -> ReviewRequest:
        review_request.status = ReviewRequestStatus.COMPLETED
        review_request.completed_at = datetime.now(timezone.utc)
        self.db.add(review_request)
        self.db.commit()
        return review_request

    def _deliver_request(self, review_request: ReviewRequest) -> None:
        contact = self.db.get(Contact, review_request.contact_id)
        if not contact:
            logger.warning("Review request missing contact %s", review_request.contact_id)
            return
        link = f"{settings.CLIENT_APP_URL}/r/{review_request.id}"
        greeting = f"Hi {contact.name}," if contact.name else "Hi there,"
        sms_message = f"{greeting} thanks for choosing us! Would you share your experience? {link}"
        email_message = f"{greeting} Please leave a review: {link}"
        try:
            if review_request.channel == "sms":
                if not contact.phone:
                    raise ValueError("Contact missing phone number")
                self._send_sms(contact.phone, sms_message)
            else:
                if not contact.email:
                    raise ValueError("Contact missing email")
                subject = "Please leave a review"
                self.notifier.send_email(
                    to_email=contact.email,
                    subject=subject,
                    html_body=email_message,
                    text_body=email_message,
                )
            self.mark_sent(review_request)
            self.audit.log(
                action="review_request.sent",
                organization_id=review_request.organization_id,
                entity_type="review_request",
                entity_id=str(review_request.id),
                metadata={"channel": review_request.channel},
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception("Failed to send review request %s: %s", review_request.id, exc)

    def _send_sms(self, to_number: str, message: str) -> None:
        account_sid = settings.TWILIO_ACCOUNT_SID
        auth_token = settings.TWILIO_AUTH_TOKEN
        from_number = settings.TWILIO_FROM_NUMBER
        if not (account_sid and auth_token and from_number):
            logger.warning("Twilio credentials are not configured; SMS not sent")
            return
        url = f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json"
        data = {"From": from_number, "To": to_number, "Body": message}
        response = httpx.post(url, data=data, auth=(account_sid, auth_token), timeout=15)
        response.raise_for_status()

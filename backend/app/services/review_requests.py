from __future__ import annotations

from datetime import datetime, timedelta, timezone
import uuid

from sqlalchemy.orm import Session

from backend.app.core.config import settings
from backend.app.models.contact import Contact
from backend.app.models.enums import ReviewRequestStatus
from backend.app.models.job import Job
from backend.app.models.review_request import ReviewRequest
from backend.app.services.actions import ActionService
from backend.app.services.audit import AuditService


class ReviewRequestService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.actions = ActionService(db)
        self.audit = AuditService(db)

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
    ) -> Job:
        job = Job(
            organization_id=organization_id,
            contact_id=contact_id,
            location_id=location_id,
            completed_at=completed_at or datetime.now(timezone.utc),
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
            action_type="custom",
            run_at=scheduled_for,
            payload={"review_request_id": str(request.id)},
        )
        self.audit.log(
            event_type="review_request.scheduled",
            organization_id=organization_id,
            metadata={"review_request_id": str(request.id)},
        )
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

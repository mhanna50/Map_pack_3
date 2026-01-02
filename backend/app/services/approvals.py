from __future__ import annotations

from datetime import datetime, timezone
import uuid

from sqlalchemy.orm import Session

from backend.app.models.approval_request import ApprovalRequest
from backend.app.models.enums import ApprovalCategory, ApprovalStatus
from backend.app.models.review import Review
from backend.app.services.audit import AuditService


class ApprovalService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.audit = AuditService(db)

    def create_request(
        self,
        *,
        organization_id: uuid.UUID,
        location_id: uuid.UUID | None,
        category: ApprovalCategory,
        reason: str,
        payload: dict | None = None,
        before_state: dict | None = None,
        requested_by: uuid.UUID | None = None,
    ) -> ApprovalRequest:
        request = ApprovalRequest(
            organization_id=organization_id,
            location_id=location_id,
            category=category,
            reason=reason,
            payload=payload or {},
            before_state=before_state or {},
            requested_by=requested_by,
        )
        self.db.add(request)
        self.db.commit()
        self.db.refresh(request)
        self.audit.log(
            event_type="approval.requested",
            organization_id=organization_id,
            location_id=location_id,
            metadata={"approval_id": str(request.id), "category": category.value},
        )
        return request

    def list_requests(
        self,
        *,
        organization_id: uuid.UUID | None = None,
        location_id: uuid.UUID | None = None,
        status: ApprovalStatus | None = None,
    ) -> list[ApprovalRequest]:
        query = self.db.query(ApprovalRequest)
        if organization_id:
            query = query.filter(ApprovalRequest.organization_id == organization_id)
        if location_id:
            query = query.filter(ApprovalRequest.location_id == location_id)
        if status:
            query = query.filter(ApprovalRequest.status == status)
        return list(query.order_by(ApprovalRequest.created_at.asc()).all())

    def approve(
        self,
        request: ApprovalRequest,
        *,
        approved_by: uuid.UUID | None = None,
        notes: str | None = None,
    ) -> ApprovalRequest:
        request.status = ApprovalStatus.APPROVED
        request.resolved_by = approved_by
        request.resolution_notes = notes
        request.resolved_at = datetime.now(timezone.utc)
        self.db.add(request)
        self.db.commit()
        self.db.refresh(request)
        self.audit.log(
            event_type="approval.approved",
            organization_id=request.organization_id,
            location_id=request.location_id,
            metadata={"approval_id": str(request.id)},
        )
        return request

    def reject(
        self,
        request: ApprovalRequest,
        *,
        rejected_by: uuid.UUID | None = None,
        notes: str | None = None,
    ) -> ApprovalRequest:
        request.status = ApprovalStatus.REJECTED
        request.resolved_by = rejected_by
        request.resolution_notes = notes
        request.resolved_at = datetime.now(timezone.utc)
        self.db.add(request)
        self.db.commit()
        self.db.refresh(request)
        self.audit.log(
            event_type="approval.rejected",
            organization_id=request.organization_id,
            location_id=request.location_id,
            metadata={"approval_id": str(request.id)},
        )
        return request

    def rollback(
        self,
        request: ApprovalRequest,
        *,
        initiated_by: uuid.UUID | None = None,
        notes: str | None = None,
    ) -> ApprovalRequest:
        request.status = ApprovalStatus.ROLLED_BACK
        request.resolved_by = initiated_by
        request.resolution_notes = notes or "Rolled back"
        request.resolved_at = datetime.now(timezone.utc)
        self.db.add(request)
        self.db.commit()
        self.db.refresh(request)
        self.audit.log(
            event_type="approval.rollback",
            organization_id=request.organization_id,
            location_id=request.location_id,
            metadata={"approval_id": str(request.id), "before_state": request.before_state},
        )
        return request

    def queue_review_reply(self, review: Review, *, suggested_reply: str | None = None) -> ApprovalRequest:
        before_state = {
            "status": review.status.value,
            "reply": review.reply_comment,
        }
        payload = {
            "review_id": str(review.id),
            "suggested_reply": suggested_reply,
        }
        return self.create_request(
            organization_id=review.organization_id,
            location_id=review.location_id,
            category=ApprovalCategory.REVIEW_REPLY,
            reason="Negative review reply requires approval",
            payload=payload,
            before_state=before_state,
        )

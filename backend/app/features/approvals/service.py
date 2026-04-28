from __future__ import annotations

from datetime import datetime, timezone
import uuid

from sqlalchemy.orm import Session

from backend.app.models.approval_request import ApprovalRequest
from backend.app.models.enums import ApprovalCategory, ApprovalStatus, ReviewRating, ReviewStatus
from backend.app.models.review import Review
from backend.app.models.review_reply import ReviewReply
from backend.app.services.audit import AuditService
from backend.app.services.validators import assert_location_in_org


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
        severity: str | None = None,
        payload: dict | None = None,
        before_state: dict | None = None,
        source: dict | None = None,
        proposal: dict | None = None,
        requested_by: uuid.UUID | None = None,
    ) -> ApprovalRequest:
        if location_id:
            assert_location_in_org(self.db, location_id=location_id, organization_id=organization_id)
        request = ApprovalRequest(
            organization_id=organization_id,
            location_id=location_id,
            category=category,
            reason=reason,
            severity=severity or "normal",
            payload=payload or {},
            before_state=before_state or {},
            source_json=source or {},
            proposal_json=proposal or {},
            requested_by=requested_by,
        )
        self.db.add(request)
        self.db.commit()
        self.db.refresh(request)
        self.audit.log(
            action="approval.requested",
            organization_id=organization_id,
            location_id=location_id,
            entity_type="approval_request",
            entity_id=str(request.id),
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
        content: str | None = None,
    ) -> ApprovalRequest:
        request.status = ApprovalStatus.APPROVED
        request.resolved_by = approved_by
        request.resolution_notes = notes
        request.resolved_at = datetime.now(timezone.utc)
        if content:
            request.approved_content = content
        elif not request.approved_content:
            request.approved_content = (request.proposal_json or {}).get("reply")
        self.db.add(request)
        self.db.commit()
        self.db.refresh(request)
        self.audit.log(
            action="approval.approved",
            organization_id=request.organization_id,
            location_id=request.location_id,
            entity_type="approval_request",
            entity_id=str(request.id),
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
            action="approval.rejected",
            organization_id=request.organization_id,
            location_id=request.location_id,
            entity_type="approval_request",
            entity_id=str(request.id),
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
            action="approval.rollback",
            organization_id=request.organization_id,
            location_id=request.location_id,
            entity_type="approval_request",
            entity_id=str(request.id),
            before=request.before_state,
            metadata={"approval_id": str(request.id)},
        )
        return request

    def queue_review_reply(self, review: Review, *, suggested_reply: str | None = None) -> ApprovalRequest:
        before_state = {
            "status": review.status.value,
            "reply": review.reply_comment,
        }
        payload = {
            "review_id": str(review.id),
        }
        severity = "critical" if review.rating in {ReviewRating.ONE, ReviewRating.TWO} else "warning"
        source = {
            "review_id": str(review.id),
            "rating": review.rating.value,
            "comment": review.comment,
            "author": review.author_name,
        }
        proposal = {
            "reply": suggested_reply
            or f"Hi {review.author_name or 'there'}, thanks for the feedback. We will reach out to make this right.",
        }
        return self.create_request(
            organization_id=review.organization_id,
            location_id=review.location_id,
            category=ApprovalCategory.REVIEW_REPLY,
            reason="Negative review reply requires approval",
            payload=payload,
            before_state=before_state,
            severity=severity,
            source=source,
            proposal=proposal,
        )

    def publish(
        self,
        request: ApprovalRequest,
        *,
        actor_user_id: uuid.UUID | None = None,
        external_id: str | None = None,
        content: str | None = None,
    ) -> ApprovalRequest:
        final_content = content or request.approved_content or (request.proposal_json or {}).get("reply")
        if not final_content:
            raise ValueError("No content available to publish")
        if request.category == ApprovalCategory.REVIEW_REPLY:
            review_id = (request.payload or {}).get("review_id")
            if review_id:
                review = self.db.get(Review, uuid.UUID(review_id))
                if review:
                    reply = ReviewReply(
                        review_id=review.id,
                        body=final_content,
                        auto_generated=True,
                        approved=True,
                        approved_by=actor_user_id,
                        metadata_json={"approval_id": str(request.id)},
                    )
                    review.reply_comment = final_content
                    review.reply_submitted_at = datetime.now(timezone.utc).isoformat()
                    review.status = ReviewStatus.APPROVED
                    self.db.add(reply)
                    self.db.add(review)
        request.approved_content = final_content
        request.published_external_id = external_id
        request.published_at = datetime.now(timezone.utc)
        request.status = ApprovalStatus.APPROVED
        self.db.add(request)
        self.db.commit()
        self.db.refresh(request)
        self.audit.log(
            action="approval.published",
            organization_id=request.organization_id,
            location_id=request.location_id,
            entity_type="approval_request",
            entity_id=str(request.id),
            metadata={"approval_id": str(request.id), "external_id": external_id},
        )
        return request

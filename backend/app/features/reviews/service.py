from __future__ import annotations

from datetime import datetime, timezone
import uuid

from sqlalchemy.orm import Session

from backend.app.models.enums import ReviewRating, ReviewStatus
from backend.app.models.review import Review
from backend.app.models.review_reply import ReviewReply
from backend.app.services.approvals import ApprovalService


class ReviewService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def ingest_review(
        self,
        *,
        organization_id: uuid.UUID,
        location_id: uuid.UUID,
        external_review_id: str,
        rating: ReviewRating,
        comment: str,
        author_name: str | None,
        metadata: dict | None = None,
    ) -> Review:
        review = self.db.query(Review).filter_by(external_review_id=external_review_id).one_or_none()
        if review:
            review.comment = comment
            review.rating = rating
            review.author_name = author_name or review.author_name
            review.metadata_json = metadata or review.metadata_json
        else:
            review = Review(
                organization_id=organization_id,
                location_id=location_id,
                external_review_id=external_review_id,
                rating=rating,
                comment=comment,
                author_name=author_name,
                metadata_json=metadata or {},
            )
            self.db.add(review)
        self.db.commit()
        self.db.refresh(review)
        return review

    def auto_reply_positive(self, review: Review, template: str) -> ReviewReply | None:
        if review.rating in {ReviewRating.FIVE, ReviewRating.FOUR}:
            reply = ReviewReply(
                review_id=review.id,
                body=template.format(name=review.author_name or "there"),
                auto_generated=True,
                approved=True,
            )
            review.status = ReviewStatus.AUTO_REPLIED
            review.reply_comment = reply.body
            review.reply_submitted_at = datetime.now(timezone.utc).isoformat()
            self.db.add(reply)
            self.db.add(review)
            self.db.commit()
            self.db.refresh(review)
            return reply
        review.status = ReviewStatus.NEEDS_APPROVAL
        self.db.add(review)
        self.db.commit()
        ApprovalService(self.db).queue_review_reply(review)
        return None

    def approve_reply(self, reply: ReviewReply, user_id: uuid.UUID) -> ReviewReply:
        reply.approved = True
        reply.approved_by = user_id
        reply.review.status = ReviewStatus.APPROVED
        self.db.add(reply)
        self.db.add(reply.review)
        self.db.commit()
        return reply

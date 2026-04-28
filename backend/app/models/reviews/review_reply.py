from __future__ import annotations

import uuid

from sqlalchemy import Boolean, ForeignKey, String, event, select
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.db.base import Base
from backend.app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class ReviewReply(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "review_replies"

    tenant_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=False)
    review_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("reviews.id", ondelete="CASCADE"), nullable=False
    )
    body: Mapped[str] = mapped_column(String)
    auto_generated: Mapped[bool] = mapped_column(Boolean, default=True)
    approved: Mapped[bool] = mapped_column(Boolean, default=False)
    approved_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    metadata_json: Mapped[dict | None] = mapped_column(JSONB, default=dict)

    review = relationship("Review", back_populates="replies")


@event.listens_for(ReviewReply, "before_insert")
@event.listens_for(ReviewReply, "before_update")
def _sync_review_reply_tenant_id(_mapper, connection, target: ReviewReply) -> None:
    if target.tenant_id is not None:
        return
    if target.review is not None:
        target.tenant_id = target.review.organization_id
        return
    if target.review_id is None:
        return
    from backend.app.models.reviews.review import Review

    target.tenant_id = connection.execute(
        select(Review.__table__.c.tenant_id).where(Review.__table__.c.id == target.review_id)
    ).scalar_one_or_none()

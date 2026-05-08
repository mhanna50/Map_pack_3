from __future__ import annotations

import uuid

from sqlalchemy import Enum, ForeignKey, Index, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db.base import Base
from .enums import ReviewRating, ReviewStatus
from .mixins import TimestampMixin, UUIDPrimaryKeyMixin


class Review(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "reviews"
    __table_args__ = (
        Index("ix_review_org", "organization_id"),
        Index("ix_review_location", "location_id"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    location_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id"), nullable=False
    )
    external_review_id: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    author_name: Mapped[str | None] = mapped_column(String(255))
    rating: Mapped[ReviewRating] = mapped_column(
        Enum(ReviewRating, name="review_rating"), nullable=False
    )
    comment: Mapped[str] = mapped_column(String)
    reply_comment: Mapped[str | None] = mapped_column(String)
    reply_submitted_at: Mapped[str | None] = mapped_column(String)
    sentiment: Mapped[str | None] = mapped_column(String(32))
    topics: Mapped[list[str] | None] = mapped_column(JSONB, default=list)
    urgency_score: Mapped[float | None]
    status: Mapped[ReviewStatus] = mapped_column(
        Enum(ReviewStatus, name="review_status"), nullable=False, default=ReviewStatus.NEW
    )
    metadata_json: Mapped[dict | None] = mapped_column(JSONB, default=dict)

    location = relationship("Location")
    replies = relationship("ReviewReply", back_populates="review", cascade="all,delete")

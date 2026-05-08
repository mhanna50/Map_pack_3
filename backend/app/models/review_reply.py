from __future__ import annotations

import uuid

from sqlalchemy import Boolean, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db.base import Base
from .mixins import TimestampMixin, UUIDPrimaryKeyMixin


class ReviewReply(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "review_replies"

    review_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("reviews.id", ondelete="CASCADE"), nullable=False
    )
    body: Mapped[str] = mapped_column(String)
    auto_generated: Mapped[bool] = mapped_column(Boolean, default=True)
    approved: Mapped[bool] = mapped_column(Boolean, default=False)
    approved_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    metadata_json: Mapped[dict | None] = mapped_column(JSONB, default=dict)

    review = relationship("Review", back_populates="replies")

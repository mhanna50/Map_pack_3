from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db.base import Base
from .enums import ReviewRequestStatus
from .mixins import TimestampMixin, UUIDPrimaryKeyMixin


class ReviewRequest(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "review_requests"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    location_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id")
    )
    contact_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("contacts.id"), nullable=False
    )
    job_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("jobs.id")
    )
    channel: Mapped[str] = mapped_column(String(16), default="sms")
    status: Mapped[ReviewRequestStatus] = mapped_column(
        Enum(ReviewRequestStatus, name="review_request_status"),
        default=ReviewRequestStatus.PENDING,
        nullable=False,
    )
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reminders_sent: Mapped[int] = mapped_column(Integer, default=0)
    metadata_json: Mapped[dict | None] = mapped_column(JSONB, default=dict)
    last_link_click_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    contact = relationship("Contact")
    job = relationship("Job")

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db.base import Base
from .mixins import TimestampMixin, UUIDPrimaryKeyMixin


DEFAULT_TOPIC_KEY = "__default__"


class BucketPerformance(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "bucket_performance"
    __table_args__ = (
        UniqueConstraint(
            "organization_id",
            "location_id",
            "bucket",
            "topic_tag",
            name="uq_bucket_performance",
        ),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    location_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id"), nullable=False
    )
    bucket: Mapped[str] = mapped_column(String(64), nullable=False)
    topic_tag: Mapped[str] = mapped_column(String(128), nullable=False, default=DEFAULT_TOPIC_KEY)
    score: Mapped[float] = mapped_column(Float, default=0.0)
    last_engaged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    organization = relationship("Organization")
    location = relationship("Location")

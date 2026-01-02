from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db.base import Base
from .mixins import TimestampMixin, UUIDPrimaryKeyMixin


class CompetitorSnapshot(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "competitor_snapshots"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    location_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id"), nullable=False
    )
    competitor_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("competitor_profiles.id"), nullable=False
    )
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    review_count: Mapped[int] = mapped_column(Integer, default=0)
    average_rating: Mapped[float] = mapped_column(Float, default=0.0)
    review_velocity_per_week: Mapped[float] = mapped_column(Float, default=0.0)
    posting_frequency_per_week: Mapped[float] = mapped_column(Float, default=0.0)
    photo_count: Mapped[int] = mapped_column(Integer, default=0)
    gap_flags: Mapped[list[str] | None] = mapped_column(JSONB, default=list)
    notes: Mapped[str | None] = mapped_column(String(512))
    metadata_json: Mapped[dict | None] = mapped_column(JSONB, default=dict)

    competitor = relationship("CompetitorProfile", back_populates="snapshots")

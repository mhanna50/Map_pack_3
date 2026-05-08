from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import Date, Float, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db.base import Base
from .mixins import TimestampMixin, UUIDPrimaryKeyMixin


class DailySignal(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "daily_signals"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    location_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id"), nullable=False
    )
    signal_date: Mapped[date] = mapped_column(Date, nullable=False)
    days_since_post: Mapped[int | None] = mapped_column(Integer)
    review_count_7d: Mapped[int | None] = mapped_column(Integer)
    avg_rating_30d: Mapped[float | None] = mapped_column(Float)
    rank_delta_7d: Mapped[float | None] = mapped_column(Float)
    extra_metrics: Mapped[dict | None] = mapped_column(JSONB, default=dict)

    organization = relationship("Organization")
    location = relationship("Location")

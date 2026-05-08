from __future__ import annotations

import uuid

from sqlalchemy import Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db.base import Base
from .mixins import TimestampMixin, UUIDPrimaryKeyMixin


class PostingWindowStat(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "posting_window_stats"
    __table_args__ = (
        UniqueConstraint("location_id", "window_id", name="uq_location_window"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    location_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id"), nullable=False
    )
    window_id: Mapped[str] = mapped_column(String(32), nullable=False)
    impressions: Mapped[int] = mapped_column(Integer, default=0)
    clicks: Mapped[int] = mapped_column(Integer, default=0)
    conversions: Mapped[int] = mapped_column(Integer, default=0)

    organization = relationship("Organization")
    location = relationship("Location")

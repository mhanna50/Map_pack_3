from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db.base import Base
from .enums import CompetitorSource
from .mixins import TimestampMixin, UUIDPrimaryKeyMixin


class CompetitorProfile(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "competitor_profiles"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    location_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    google_location_id: Mapped[str | None] = mapped_column(String(255))
    source: Mapped[CompetitorSource] = mapped_column(
        Enum(CompetitorSource, name="competitor_source"),
        nullable=False,
        default=CompetitorSource.MANUAL,
    )
    category: Mapped[str | None] = mapped_column(String(255))
    metadata_json: Mapped[dict | None] = mapped_column(JSONB, default=dict)
    last_monitored_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    location = relationship("Location")
    snapshots = relationship(
        "CompetitorSnapshot", back_populates="competitor", cascade="all,delete"
    )

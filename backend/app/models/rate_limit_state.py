from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, UniqueConstraint, Integer
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.db.base import Base
from backend.app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class RateLimitState(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "rate_limit_state"
    __table_args__ = (
        UniqueConstraint("organization_id", "location_id", name="uq_rate_limit_scope"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    location_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id")
    )
    window_starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    window_ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    limit: Mapped[int] = mapped_column(Integer, default=1000)
    used: Mapped[int] = mapped_column(Integer, default=0)
    cooldown_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    metadata_json: Mapped[dict | None] = mapped_column(JSONB, default=dict)

    organization = relationship("Organization")
    location = relationship("Location")

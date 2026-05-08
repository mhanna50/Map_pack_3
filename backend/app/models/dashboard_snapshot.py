from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..db.base import Base
from .mixins import TimestampMixin, UUIDPrimaryKeyMixin


class DashboardSnapshot(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "dashboard_snapshots"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    location_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id")
    )
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    metrics: Mapped[dict | None] = mapped_column(JSONB, default=dict)
    tasks: Mapped[dict | None] = mapped_column(JSONB, default=dict)

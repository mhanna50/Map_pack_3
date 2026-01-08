from __future__ import annotations

import uuid

from sqlalchemy import DateTime, Enum, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db.base import Base
from .enums import AlertSeverity, AlertStatus
from .mixins import TimestampMixin, UUIDPrimaryKeyMixin


class Alert(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "alerts"

    organization_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id")
    )
    location_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id")
    )
    severity: Mapped[AlertSeverity] = mapped_column(
        Enum(AlertSeverity, name="alert_severity"), default=AlertSeverity.INFO, nullable=False
    )
    alert_type: Mapped[str] = mapped_column("type", String(64), nullable=False)
    message: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[AlertStatus] = mapped_column(
        Enum(AlertStatus, name="alert_status"), default=AlertStatus.OPEN, nullable=False
    )
    metadata_json: Mapped[dict | None] = mapped_column(JSONB, default=dict)
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    acknowledged_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    resolved_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    client_notified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    client_notified_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    internal_notes: Mapped[str | None] = mapped_column(String)

    organization = relationship("Organization", back_populates="alerts")
    location = relationship("Location", back_populates="alerts")

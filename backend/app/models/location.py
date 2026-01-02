from __future__ import annotations

import uuid

from sqlalchemy import Enum, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db.base import Base
from .enums import LocationStatus
from .mixins import TimestampMixin, UUIDPrimaryKeyMixin


class Location(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "locations"
    __table_args__ = (
        Index("ix_location_org", "organization_id"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    connected_account_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("connected_accounts.id")
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    timezone: Mapped[str] = mapped_column(String(64), default="UTC", nullable=False)
    google_location_id: Mapped[str | None] = mapped_column(String(255), unique=True)
    address: Mapped[dict | None] = mapped_column(JSONB, default=dict)
    status: Mapped[LocationStatus] = mapped_column(
        Enum(LocationStatus, name="location_status"),
        default=LocationStatus.DRAFT,
        nullable=False,
    )

    organization = relationship("Organization", back_populates="locations")
    connected_account = relationship("ConnectedAccount", back_populates="locations")
    settings = relationship(
        "LocationSettings", back_populates="location", uselist=False
    )
    actions = relationship("Action", back_populates="location")
    audit_logs = relationship("AuditLog", back_populates="location")

from __future__ import annotations

import uuid

from sqlalchemy import Boolean, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.db.base import Base
from backend.app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class BusinessService(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "business_services"
    __table_args__ = (
        UniqueConstraint("location_id", "normalized_name", name="uq_business_service_location_name"),
        Index("ix_business_service_org_loc", "organization_id", "location_id"),
        Index("ix_business_service_status", "is_active"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    location_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    normalized_name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(String)
    service_value_cents: Mapped[int | None] = mapped_column(Integer)
    source: Mapped[str] = mapped_column(String(32), default="settings", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    metadata_json: Mapped[dict | None] = mapped_column(JSONB, default=dict)

    organization = relationship("Organization")
    location = relationship("Location")

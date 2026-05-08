from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db.base import Base
from .mixins import TimestampMixin, UUIDPrimaryKeyMixin


class ListingAudit(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "listing_audits"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    location_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id"), nullable=False
    )
    category: Mapped[str | None] = mapped_column(String(128))
    audited_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    missing_services: Mapped[list[str] | None] = mapped_column(JSONB, default=list)
    missing_attributes: Mapped[list[str] | None] = mapped_column(JSONB, default=list)
    description_suggestions: Mapped[list[str] | None] = mapped_column(JSONB, default=list)
    photos_count: Mapped[int | None]
    hours_status: Mapped[str | None] = mapped_column(String(64))
    metadata_json: Mapped[dict | None] = mapped_column(JSONB, default=dict)

    location = relationship("Location")

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.db.base import Base
from backend.app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class ListingAudit(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "listing_audits"
    __table_args__ = (
        Index("ix_listing_audit_org_loc", "tenant_id", "location_id"),
        Index("ix_listing_audit_audited_at", "audited_at"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        "tenant_id", UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
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
    profile_completeness_score: Mapped[float | None] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(32), default="completed", nullable=False)
    trigger_source: Mapped[str] = mapped_column(String(32), default="manual", nullable=False)
    previous_audit_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("listing_audits.id"))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    summary_json: Mapped[dict | None] = mapped_column(JSONB, default=dict)
    metadata_json: Mapped[dict | None] = mapped_column(JSONB, default=dict)

    location = relationship("Location")
    previous_audit = relationship("ListingAudit", remote_side="ListingAudit.id")
    items = relationship("ListingAuditItem", back_populates="audit", cascade="all,delete")

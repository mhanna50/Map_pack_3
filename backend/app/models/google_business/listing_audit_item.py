from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.db.base import Base
from backend.app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class ListingAuditItem(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "listing_audit_items"
    __table_args__ = (
        Index("ix_listing_audit_item_audit", "audit_id"),
        Index("ix_listing_audit_item_status", "status"),
        Index("ix_listing_audit_item_field", "field_name"),
    )

    audit_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("listing_audits.id"), nullable=False)
    organization_id: Mapped[uuid.UUID] = mapped_column("tenant_id", UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    location_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("locations.id"), nullable=False)
    field_name: Mapped[str] = mapped_column(String(96), nullable=False)
    item_type: Mapped[str] = mapped_column(String(64), default="profile_field", nullable=False)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    current_value: Mapped[dict | list | str | int | float | None] = mapped_column(JSONB, default=dict)
    recommended_value: Mapped[dict | list | str | int | float | None] = mapped_column(JSONB, default=dict)
    severity: Mapped[str] = mapped_column(String(24), default="low", nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="complete", nullable=False)
    auto_fixable: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    user_action_required: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    before_value: Mapped[dict | list | str | int | float | None] = mapped_column(JSONB, default=dict)
    after_value: Mapped[dict | list | str | int | float | None] = mapped_column(JSONB, default=dict)
    instructions: Mapped[str | None] = mapped_column(String(1024))
    seo_reason: Mapped[str | None] = mapped_column(String(1024))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    auto_applied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    metadata_json: Mapped[dict | None] = mapped_column(JSONB, default=dict)

    audit = relationship("ListingAudit", back_populates="items")
    organization = relationship("Organization")
    location = relationship("Location")

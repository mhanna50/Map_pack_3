from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.db.base import Base
from backend.app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class GbpOptimizationAction(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "gbp_optimization_actions"
    __table_args__ = (
        Index("ix_gbp_optimization_action_cycle", "campaign_cycle_id"),
        Index("ix_gbp_optimization_action_status", "status"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    location_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id"), nullable=False
    )
    campaign_cycle_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("keyword_campaign_cycles.id"), nullable=False
    )
    selected_keyword_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("selected_keywords.id")
    )
    action_type: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="queued", nullable=False)
    auto_apply_allowed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    before_value: Mapped[dict | None] = mapped_column(JSONB, default=dict)
    after_value: Mapped[dict | None] = mapped_column(JSONB, default=dict)
    source_keywords: Mapped[list[str] | None] = mapped_column(JSONB, default=list)
    applied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    notes: Mapped[str | None] = mapped_column(String(512))

    organization = relationship("Organization")
    location = relationship("Location")
    campaign_cycle = relationship("KeywordCampaignCycle")
    selected_keyword = relationship("SelectedKeyword")

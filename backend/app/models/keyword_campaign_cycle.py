from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.db.base import Base
from backend.app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class KeywordCampaignCycle(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "keyword_campaign_cycles"
    __table_args__ = (
        UniqueConstraint(
            "organization_id",
            "location_id",
            "cycle_year",
            "cycle_month",
            name="uq_keyword_campaign_cycle_month",
        ),
        Index("ix_keyword_campaign_cycle_org_loc", "organization_id", "location_id"),
        Index("ix_keyword_campaign_cycle_status", "status"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    location_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id"), nullable=False
    )
    cycle_year: Mapped[int] = mapped_column(Integer, nullable=False)
    cycle_month: Mapped[int] = mapped_column(Integer, nullable=False)
    trigger_source: Mapped[str] = mapped_column(String(32), default="monthly", nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="queued", nullable=False)
    onboarding_triggered: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    baseline_scanned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    followup_due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    followup_scanned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    data_sources_json: Mapped[dict | None] = mapped_column(JSONB, default=dict)
    notes_json: Mapped[dict | None] = mapped_column(JSONB, default=dict)

    organization = relationship("Organization")
    location = relationship("Location")

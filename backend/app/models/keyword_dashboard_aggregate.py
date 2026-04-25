from __future__ import annotations

import uuid

from sqlalchemy import Float, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.db.base import Base
from backend.app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class KeywordDashboardAggregate(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "keyword_dashboard_aggregates"
    __table_args__ = (
        UniqueConstraint("campaign_cycle_id", name="uq_keyword_dashboard_aggregate_cycle"),
        Index("ix_keyword_dashboard_aggregate_org_loc", "organization_id", "location_id"),
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
    cycle_label: Mapped[str] = mapped_column(String(32), nullable=False)
    target_keywords_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    avg_baseline_rank: Mapped[float | None] = mapped_column(Float)
    avg_followup_rank: Mapped[float | None] = mapped_column(Float)
    avg_rank_change: Mapped[float | None] = mapped_column(Float)
    posts_generated_from_keywords: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    gbp_updates_applied: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    visibility_baseline: Mapped[float | None] = mapped_column(Float)
    visibility_followup: Mapped[float | None] = mapped_column(Float)
    visibility_change: Mapped[float | None] = mapped_column(Float)
    service_area_improvement: Mapped[float | None] = mapped_column(Float)
    edge_of_grid_improvement: Mapped[float | None] = mapped_column(Float)
    summary_json: Mapped[dict | None] = mapped_column(JSONB, default=dict)

    organization = relationship("Organization")
    location = relationship("Location")
    campaign_cycle = relationship("KeywordCampaignCycle")

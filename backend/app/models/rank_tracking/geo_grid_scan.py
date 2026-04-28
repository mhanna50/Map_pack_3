from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.db.base import Base
from backend.app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class GeoGridScan(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "geo_grid_scans"
    __table_args__ = (
        UniqueConstraint(
            "campaign_cycle_id",
            "keyword",
            "scan_type",
            name="uq_geo_grid_scan_cycle_keyword_type",
        ),
        Index("ix_geo_grid_scan_cycle", "campaign_cycle_id"),
        Index("ix_geo_grid_scan_location_date", "location_id", "scan_date"),
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
    keyword: Mapped[str] = mapped_column(String(255), nullable=False)
    scan_type: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="queued", nullable=False)
    scan_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    center_latitude: Mapped[float | None] = mapped_column(Float)
    center_longitude: Mapped[float | None] = mapped_column(Float)
    radius_miles: Mapped[float] = mapped_column(Float, default=5.0, nullable=False)
    spacing_miles: Mapped[float] = mapped_column(Float, default=1.0, nullable=False)
    rows: Mapped[int] = mapped_column(Integer, default=7, nullable=False)
    columns: Mapped[int] = mapped_column(Integer, default=7, nullable=False)
    average_rank: Mapped[float | None] = mapped_column(Float)
    best_rank: Mapped[int | None] = mapped_column(Integer)
    worst_rank: Mapped[int | None] = mapped_column(Integer)
    visibility_score: Mapped[float | None] = mapped_column(Float)
    total_points: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    metadata_json: Mapped[dict | None] = mapped_column(JSONB, default=dict)

    organization = relationship("Organization")
    location = relationship("Location")
    campaign_cycle = relationship("KeywordCampaignCycle")
    selected_keyword = relationship("SelectedKeyword")

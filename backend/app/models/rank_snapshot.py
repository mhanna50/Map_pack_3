from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Index, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db.base import Base
from .mixins import TimestampMixin, UUIDPrimaryKeyMixin


class RankSnapshot(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "rank_snapshots"
    __table_args__ = (
        Index("ix_snapshot_keyword_point", "keyword_id", "grid_point_id"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    location_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id"), nullable=False
    )
    keyword_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("location_keywords.id"), nullable=True
    )
    grid_point_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("geo_grid_points.id"), nullable=True
    )
    checked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    rank: Mapped[int | None] = mapped_column(Integer)
    in_pack: Mapped[bool] = mapped_column(Boolean, default=False)
    competitor_name: Mapped[str | None] = mapped_column(String(255))
    metadata_json: Mapped[dict | None] = mapped_column(JSONB, default=dict)

    keyword = relationship("LocationKeyword")
    grid_point = relationship("GeoGridPoint")

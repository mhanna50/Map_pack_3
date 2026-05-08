from __future__ import annotations

import uuid

from sqlalchemy import Boolean, Float, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.db.base import Base
from backend.app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class GeoGridScanPoint(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "geo_grid_scan_points"
    __table_args__ = (
        UniqueConstraint("geo_grid_scan_id", "row_index", "column_index", name="uq_geo_grid_scan_point_cell"),
        Index("ix_geo_grid_scan_point_scan", "geo_grid_scan_id"),
        Index("ix_geo_grid_scan_point_rank", "rank"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    location_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id"), nullable=False
    )
    geo_grid_scan_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("geo_grid_scans.id"), nullable=False
    )
    row_index: Mapped[int] = mapped_column(Integer, nullable=False)
    column_index: Mapped[int] = mapped_column(Integer, nullable=False)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    rank: Mapped[int | None] = mapped_column(Integer)
    in_pack: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    competitor_name: Mapped[str | None] = mapped_column(String(255))
    rank_band: Mapped[str | None] = mapped_column(String(32))
    color_hex: Mapped[str | None] = mapped_column(String(16))
    metadata_json: Mapped[dict | None] = mapped_column(JSONB, default=dict)

    organization = relationship("Organization")
    location = relationship("Location")
    geo_grid_scan = relationship("GeoGridScan")

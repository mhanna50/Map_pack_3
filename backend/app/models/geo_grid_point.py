from __future__ import annotations

import uuid

from sqlalchemy import Float, ForeignKey, Index, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db.base import Base
from .mixins import TimestampMixin, UUIDPrimaryKeyMixin


class GeoGridPoint(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "geo_grid_points"
    __table_args__ = (Index("ix_geo_point_location", "location_id"),)

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    location_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id"), nullable=False
    )
    label: Mapped[str | None] = mapped_column(String(64))
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    radius_index: Mapped[int] = mapped_column(Integer, default=0)

    location = relationship("Location")

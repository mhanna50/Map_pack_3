from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, Index, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db.base import Base
from .mixins import TimestampMixin, UUIDPrimaryKeyMixin


class LocationKeyword(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "location_keywords"
    __table_args__ = (Index("ix_keyword_location", "location_id", "keyword", unique=True),)

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    location_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id"), nullable=False
    )
    keyword: Mapped[str] = mapped_column(String(255), nullable=False)
    importance: Mapped[int] = mapped_column(Integer, default=1)

    location = relationship("Location")

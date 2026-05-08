from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db.base import Base
from .mixins import TimestampMixin, UUIDPrimaryKeyMixin


class MediaAlbum(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "media_albums"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    location_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id")
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(String)
    tags: Mapped[list[str] | None] = mapped_column(JSONB, default=list)

    organization = relationship("Organization")
    location = relationship("Location")
    assets = relationship("MediaAsset", back_populates="album")

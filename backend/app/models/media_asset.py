from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db.base import Base
from .enums import MediaStatus, MediaType
from .mixins import TimestampMixin, UUIDPrimaryKeyMixin


class MediaAsset(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "media_assets"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    location_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id")
    )
    album_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("media_albums.id")
    )
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    media_type: Mapped[MediaType] = mapped_column(
        Enum(MediaType, name="media_type"), nullable=False, default=MediaType.IMAGE
    )
    categories: Mapped[list[str] | None] = mapped_column(JSONB, default=list)
    description: Mapped[str | None] = mapped_column(String(512))
    storage_url: Mapped[str] = mapped_column(String, nullable=False)
    metadata_json: Mapped[dict | None] = mapped_column(JSONB, default=dict)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    auto_caption: Mapped[str | None] = mapped_column(String(512))
    status: Mapped[MediaStatus] = mapped_column(
        Enum(MediaStatus, name="media_status"), default=MediaStatus.PENDING, nullable=False
    )
    job_type: Mapped[str | None] = mapped_column(String(128))
    season: Mapped[str | None] = mapped_column(String(64))
    shot_stage: Mapped[str | None] = mapped_column(String(32))
    upload_request_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("media_upload_requests.id")
    )

    organization = relationship("Organization")
    location = relationship("Location")
    album = relationship("MediaAlbum", back_populates="assets")
    upload_request = relationship("MediaUploadRequest", back_populates="assets")

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import Date, Enum, Float, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.db.base import Base
from backend.app.models.enums import PostStatus, enum_values
from backend.app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class PostCandidate(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "post_candidates"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        "tenant_id", UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    location_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id"), nullable=False
    )
    candidate_date: Mapped[date] = mapped_column(Date, nullable=False)
    bucket: Mapped[str | None] = mapped_column(String(64))
    score: Mapped[float | None] = mapped_column(Float)
    reason_json: Mapped[dict | None] = mapped_column(JSONB, default=dict)
    proposed_caption: Mapped[str | None] = mapped_column(String)
    media_asset_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("media_assets.id"))
    status: Mapped[PostStatus] = mapped_column(
        Enum(PostStatus, name="post_status", values_callable=enum_values), default=PostStatus.DRAFT
    )
    window_id: Mapped[str | None] = mapped_column(String(32))
    fingerprint: Mapped[str | None] = mapped_column(String(255), index=True)

    organization = relationship("Organization")
    location = relationship("Location")
    media_asset = relationship("MediaAsset")

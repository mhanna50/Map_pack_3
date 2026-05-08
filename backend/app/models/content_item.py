from __future__ import annotations

import uuid

from sqlalchemy import Enum, ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.db.base import Base
from backend.app.models.enums import ContentItemStatus, PostType
from backend.app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class ContentItem(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "content_items"
    __table_args__ = (
        Index("ix_content_item_org", "organization_id"),
        Index("ix_content_item_location", "location_id"),
        UniqueConstraint(
            "organization_id",
            "location_id",
            "fingerprint",
            name="uq_content_item_fingerprint",
        ),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    location_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id")
    )
    content_type: Mapped[PostType] = mapped_column(
        Enum(PostType, name="post_type"), nullable=False, default=PostType.UPDATE
    )
    source: Mapped[str] = mapped_column(String(32), default="auto", nullable=False)
    status: Mapped[ContentItemStatus] = mapped_column(
        Enum(ContentItemStatus, name="content_item_status"),
        default=ContentItemStatus.DRAFT,
        nullable=False,
    )
    title: Mapped[str | None] = mapped_column(String(255))
    body: Mapped[str] = mapped_column(String, nullable=False)
    topic_tags: Mapped[list[str] | None] = mapped_column(JSONB, default=list)
    fingerprint: Mapped[str] = mapped_column(String(255), nullable=False)
    metadata_json: Mapped[dict | None] = mapped_column(JSONB, default=dict)
    media_asset_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("media_assets.id")
    )

    organization = relationship("Organization")
    location = relationship("Location")
    media_asset = relationship("MediaAsset")

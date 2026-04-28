from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.db.base import Base
from backend.app.models.enums import PostStatus, PostType, enum_values
from backend.app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class Post(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "posts"
    __table_args__ = (
        Index("ix_post_org", "tenant_id"),
        Index("ix_post_location", "location_id"),
        Index("ix_post_scheduled", "scheduled_at"),
        Index("ix_post_status", "status"),
    )

    # Physical DB column is `tenant_id`; keep the Python attribute as
    # organization_id for the existing service/API surface.
    organization_id: Mapped[uuid.UUID] = mapped_column(
        "tenant_id", UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    location_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id"), nullable=False
    )
    connected_account_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("connected_accounts.id")
    )
    post_type: Mapped[PostType] = mapped_column(
        Enum(PostType, name="post_type", values_callable=enum_values), default=PostType.UPDATE, nullable=False
    )
    title: Mapped[str | None] = mapped_column(String(255))
    body: Mapped[str] = mapped_column(String)
    ai_prompt_context: Mapped[dict | None] = mapped_column(JSONB, default=dict)
    status: Mapped[PostStatus] = mapped_column(
        Enum(PostStatus, name="post_status", values_callable=enum_values), default=PostStatus.DRAFT, nullable=False
    )
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    publish_result: Mapped[dict | None] = mapped_column(JSONB)
    cta: Mapped[dict | None] = mapped_column(JSONB, default=dict)
    rotation_context: Mapped[dict | None] = mapped_column(JSONB, default=dict)
    external_post_id: Mapped[str | None] = mapped_column(String(255), index=True)
    bucket: Mapped[str | None] = mapped_column(String(64))
    topic_tags: Mapped[list[str] | None] = mapped_column(JSONB, default=list)
    media_asset_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("media_assets.id")
    )
    window_id: Mapped[str | None] = mapped_column(String(32))
    fingerprint: Mapped[str | None] = mapped_column(String(255), index=True)

    organization = relationship("Organization")
    location = relationship("Location")
    connected_account = relationship("ConnectedAccount")
    variants = relationship("PostVariant", back_populates="post", cascade="all,delete")
    attachments = relationship(
        "PostMediaAttachment", back_populates="post", cascade="all,delete"
    )
    media_asset = relationship("MediaAsset")

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db.base import Base
from .enums import PostStatus, PostType
from .mixins import TimestampMixin, UUIDPrimaryKeyMixin


class Post(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "posts"
    __table_args__ = (
        Index("ix_post_org", "organization_id"),
        Index("ix_post_location", "location_id"),
        Index("ix_post_scheduled", "scheduled_at"),
        Index("ix_post_status", "status"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    location_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id"), nullable=False
    )
    connected_account_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("connected_accounts.id")
    )
    post_type: Mapped[PostType] = mapped_column(
        Enum(PostType, name="post_type"), default=PostType.UPDATE, nullable=False
    )
    title: Mapped[str | None] = mapped_column(String(255))
    body: Mapped[str] = mapped_column(String)
    ai_prompt_context: Mapped[dict | None] = mapped_column(JSONB, default=dict)
    status: Mapped[PostStatus] = mapped_column(
        Enum(PostStatus, name="post_status"), default=PostStatus.DRAFT, nullable=False
    )
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    publish_result: Mapped[dict | None] = mapped_column(JSONB)
    cta: Mapped[dict | None] = mapped_column(JSONB, default=dict)
    rotation_context: Mapped[dict | None] = mapped_column(JSONB, default=dict)

    organization = relationship("Organization")
    location = relationship("Location")
    connected_account = relationship("ConnectedAccount")
    variants = relationship("PostVariant", back_populates="post", cascade="all,delete")
    attachments = relationship(
        "PostMediaAttachment", back_populates="post", cascade="all,delete"
    )

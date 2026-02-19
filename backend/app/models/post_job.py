from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Index, String, UniqueConstraint, Integer
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.db.base import Base
from backend.app.models.enums import PostJobStatus
from backend.app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class PostJob(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "post_jobs"
    __table_args__ = (
        Index("ix_post_job_org", "organization_id"),
        Index("ix_post_job_location", "location_id"),
        UniqueConstraint("dedupe_key", name="uq_post_job_dedupe"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    location_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id"), nullable=False
    )
    content_plan_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("content_plans.id")
    )
    content_item_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("content_items.id")
    )
    dedupe_key: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[PostJobStatus] = mapped_column(
        Enum(PostJobStatus, name="post_job_status"),
        default=PostJobStatus.QUEUED,
        nullable=False,
    )
    run_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    locked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    max_attempts: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    error: Mapped[str | None] = mapped_column(String)
    result_json: Mapped[dict | None] = mapped_column(JSONB, default=dict)

    organization = relationship("Organization")
    location = relationship("Location")
    content_plan = relationship("ContentPlan")
    content_item = relationship("ContentItem")

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import Date, Enum, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.db.base import Base
from backend.app.models.enums import ContentPlanStatus
from backend.app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class ContentPlan(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "content_plans"
    __table_args__ = (
        Index("ix_content_plan_org", "organization_id"),
        Index("ix_content_plan_location", "location_id"),
        Index("ix_content_plan_date", "target_date"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    location_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id"), nullable=False
    )
    target_date: Mapped[date] = mapped_column(Date, nullable=False)
    window_id: Mapped[str | None] = mapped_column(String(32))
    status: Mapped[ContentPlanStatus] = mapped_column(
        Enum(ContentPlanStatus, name="content_plan_status"),
        default=ContentPlanStatus.PLANNED,
        nullable=False,
    )
    content_item_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("content_items.id")
    )
    candidate_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("post_candidates.id")
    )
    reason_json: Mapped[dict | None] = mapped_column(JSONB, default=dict)

    organization = relationship("Organization")
    location = relationship("Location")
    content_item = relationship("ContentItem")
    candidate = relationship("PostCandidate")

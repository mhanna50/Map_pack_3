from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import Date, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.db.base import Base
from backend.app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class GbpPostKeywordMapping(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "gbp_post_keyword_mappings"
    __table_args__ = (
        Index("ix_gbp_post_keyword_mapping_cycle", "campaign_cycle_id"),
        Index("ix_gbp_post_keyword_mapping_publish_date", "publish_date"),
        Index("ix_gbp_post_keyword_mapping_status", "status"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    location_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id"), nullable=False
    )
    campaign_cycle_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("keyword_campaign_cycles.id"), nullable=False
    )
    selected_keyword_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("selected_keywords.id")
    )
    post_candidate_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("post_candidates.id")
    )
    post_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("posts.id")
    )
    target_keyword: Mapped[str] = mapped_column(String(255), nullable=False)
    secondary_keywords: Mapped[list[str] | None] = mapped_column(JSONB, default=list)
    post_angle: Mapped[str] = mapped_column(String(64), nullable=False)
    post_type: Mapped[str] = mapped_column(String(32), nullable=False, default="update")
    cta: Mapped[str | None] = mapped_column(String(255))
    suggested_image_theme: Mapped[str | None] = mapped_column(String(255))
    publish_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="planned", nullable=False)

    organization = relationship("Organization")
    location = relationship("Location")
    campaign_cycle = relationship("KeywordCampaignCycle")
    selected_keyword = relationship("SelectedKeyword")
    post_candidate = relationship("PostCandidate")
    post = relationship("Post")

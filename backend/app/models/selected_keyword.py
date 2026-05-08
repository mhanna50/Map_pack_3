from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.db.base import Base
from backend.app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class SelectedKeyword(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "selected_keywords"
    __table_args__ = (
        UniqueConstraint("campaign_cycle_id", "rank_order", name="uq_selected_keyword_rank_order"),
        Index("ix_selected_keyword_cycle", "campaign_cycle_id"),
        Index("ix_selected_keyword_keyword", "keyword"),
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
    candidate_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("keyword_candidates.id")
    )
    rank_order: Mapped[int] = mapped_column(Integer, nullable=False)
    keyword: Mapped[str] = mapped_column(String(255), nullable=False)
    target_service_area: Mapped[str | None] = mapped_column(String(128))
    search_volume: Mapped[int | None] = mapped_column(Integer)
    competition_estimate: Mapped[float | None] = mapped_column()
    current_rank: Mapped[float | None] = mapped_column()
    intent_level: Mapped[str | None] = mapped_column(String(32))
    competition_level: Mapped[str | None] = mapped_column(String(32))
    selection_bucket: Mapped[str | None] = mapped_column(String(64))
    why_selected: Mapped[str | None] = mapped_column(String(512))
    score_breakdown_json: Mapped[dict | None] = mapped_column(JSONB, default=dict)
    classifications_json: Mapped[list[str] | None] = mapped_column(JSONB, default=list)

    organization = relationship("Organization")
    location = relationship("Location")
    campaign_cycle = relationship("KeywordCampaignCycle")
    candidate = relationship("KeywordCandidate")

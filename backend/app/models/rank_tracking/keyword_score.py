from __future__ import annotations

import uuid

from sqlalchemy import Float, ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.db.base import Base
from backend.app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class KeywordScore(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "keyword_scores"
    __table_args__ = (
        UniqueConstraint("candidate_id", name="uq_keyword_score_candidate"),
        Index("ix_keyword_score_cycle", "campaign_cycle_id"),
        Index("ix_keyword_score_overall", "overall_score"),
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
    candidate_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("keyword_candidates.id"), nullable=False
    )
    relevance_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    local_volume_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    intent_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    ticket_value_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    competition_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    opportunity_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    current_rank_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    already_dominant_penalty: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    overall_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    search_volume: Mapped[int | None] = mapped_column()
    competition_estimate: Mapped[float | None] = mapped_column(Float)
    current_rank: Mapped[float | None] = mapped_column(Float)
    score_weights_json: Mapped[dict | None] = mapped_column(JSONB, default=dict)
    classifications_json: Mapped[list[str] | None] = mapped_column(JSONB, default=list)
    rationale: Mapped[str | None] = mapped_column(String(512))

    organization = relationship("Organization")
    location = relationship("Location")
    campaign_cycle = relationship("KeywordCampaignCycle")
    candidate = relationship("KeywordCandidate")

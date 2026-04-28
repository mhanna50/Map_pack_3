from __future__ import annotations

import uuid

from sqlalchemy import Boolean, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.db.base import Base
from backend.app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class KeywordCandidate(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "keyword_candidates"
    __table_args__ = (
        Index("ix_keyword_candidate_cycle", "campaign_cycle_id"),
        Index("ix_keyword_candidate_norm", "normalized_keyword"),
        Index("ix_keyword_candidate_cluster", "cluster_key"),
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
    keyword: Mapped[str] = mapped_column(String(255), nullable=False)
    normalized_keyword: Mapped[str] = mapped_column(String(255), nullable=False)
    cluster_key: Mapped[str] = mapped_column(String(255), nullable=False)
    target_service_area: Mapped[str | None] = mapped_column(String(128))
    candidate_type: Mapped[str | None] = mapped_column(String(64))
    source_tags: Mapped[list[str] | None] = mapped_column(JSONB, default=list)
    rejection_reason: Mapped[str | None] = mapped_column(String(512))
    is_selected: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    campaign_cycle = relationship("KeywordCampaignCycle")
    organization = relationship("Organization")
    location = relationship("Location")

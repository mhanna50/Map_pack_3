from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db.base import Base
from .mixins import TimestampMixin, UUIDPrimaryKeyMixin


class RuleSimulation(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "rule_simulations"

    rule_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("automation_rules.id"), nullable=False
    )
    summary: Mapped[str | None] = mapped_column(String(512))
    metrics: Mapped[dict | None] = mapped_column(JSONB, default=dict)
    triggered_actions: Mapped[int] = mapped_column(Integer, default=0)
    sample_payload: Mapped[dict | None] = mapped_column(JSONB)

    rule = relationship("AutomationRule", back_populates="simulations")

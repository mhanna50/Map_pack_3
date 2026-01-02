from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Index, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db.base import Base
from .enums import AutomationActionType, AutomationCondition, AutomationTriggerType
from .mixins import TimestampMixin, UUIDPrimaryKeyMixin


class AutomationRule(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "automation_rules"
    __table_args__ = (
        Index("ix_rule_org", "organization_id"),
        Index("ix_rule_location", "location_id"),
        Index("ix_rule_priority", "priority", "weight"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    location_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id")
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    trigger_type: Mapped[AutomationTriggerType] = mapped_column(
        Enum(AutomationTriggerType, name="automation_trigger_type"), nullable=False
    )
    condition: Mapped[AutomationCondition] = mapped_column(
        Enum(AutomationCondition, name="automation_condition"), nullable=False
    )
    action_type: Mapped[AutomationActionType] = mapped_column(
        Enum(AutomationActionType, name="automation_action_type"), nullable=False
    )
    config: Mapped[dict | None] = mapped_column(JSONB, default=dict)
    action_config: Mapped[dict | None] = mapped_column(JSONB, default=dict)
    priority: Mapped[int] = mapped_column(Integer, default=0)
    weight: Mapped[int] = mapped_column(Integer, default=100)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    last_simulated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    organization = relationship("Organization")
    location = relationship("Location")
    simulations = relationship(
        "RuleSimulation", back_populates="rule", cascade="all, delete"
    )

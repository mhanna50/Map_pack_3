from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, Integer, String, event, select
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.db.base import Base
from backend.app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class RuleSimulation(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "rule_simulations"

    tenant_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=False)
    rule_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("automation_rules.id"), nullable=False
    )
    summary: Mapped[str | None] = mapped_column(String(512))
    metrics: Mapped[dict | None] = mapped_column(JSONB, default=dict)
    triggered_actions: Mapped[int] = mapped_column(Integer, default=0)
    sample_payload: Mapped[dict | None] = mapped_column(JSONB)

    rule = relationship("AutomationRule", back_populates="simulations")


@event.listens_for(RuleSimulation, "before_insert")
@event.listens_for(RuleSimulation, "before_update")
def _sync_rule_simulation_tenant_id(_mapper, connection, target: RuleSimulation) -> None:
    if target.tenant_id is not None:
        return
    if target.rule is not None:
        target.tenant_id = target.rule.organization_id
        return
    if target.rule_id is None:
        return
    from backend.app.models.automation.automation_rule import AutomationRule

    target.tenant_id = connection.execute(
        select(AutomationRule.__table__.c.tenant_id).where(AutomationRule.__table__.c.id == target.rule_id)
    ).scalar_one_or_none()

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum as SQLEnum, ForeignKey, Index, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db.base import Base
from .enums import ActionStatus, ActionType
from .mixins import TimestampMixin, UUIDPrimaryKeyMixin


class Action(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "actions"
    __table_args__ = (
        Index("ix_action_run_at", "run_at"),
        Index("ix_action_status", "status"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    location_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id")
    )
    connected_account_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("connected_accounts.id")
    )
    action_type: Mapped[ActionType] = mapped_column(
        SQLEnum(ActionType, name="action_type", values_callable=lambda enum: [member.value for member in enum]),
        nullable=False,
    )
    status: Mapped[ActionStatus] = mapped_column(
        SQLEnum(
            ActionStatus,
            name="action_status",
            values_callable=lambda enum: [member.value for member in enum],
        ),
        default=ActionStatus.PENDING,
        nullable=False,
    )
    payload: Mapped[dict | None] = mapped_column(JSONB, default=dict)
    run_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    locked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    max_attempts: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    priority: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    dedupe_key: Mapped[str | None] = mapped_column(String(255), unique=True)
    result: Mapped[dict | None] = mapped_column(JSONB)
    error: Mapped[str | None] = mapped_column(String)
    next_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    organization = relationship("Organization", back_populates="actions")
    location = relationship("Location", back_populates="actions")
    connected_account = relationship("ConnectedAccount", back_populates="actions")

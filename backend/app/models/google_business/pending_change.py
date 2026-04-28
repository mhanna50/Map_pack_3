from __future__ import annotations

import uuid

from sqlalchemy import Enum, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.db.base import Base
from backend.app.models.enums import PendingChangeStatus, PendingChangeType, enum_values
from backend.app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class PendingChange(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "pending_changes"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        "tenant_id", UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    location_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id"), nullable=False
    )
    change_type: Mapped[PendingChangeType] = mapped_column(
        Enum(PendingChangeType, name="pending_change_type", values_callable=enum_values), nullable=False
    )
    payload: Mapped[dict] = mapped_column(JSONB, default=dict)
    status: Mapped[PendingChangeStatus] = mapped_column(
        Enum(PendingChangeStatus, name="pending_change_status", values_callable=enum_values),
        nullable=False,
        default=PendingChangeStatus.PENDING,
    )
    notes: Mapped[str | None] = mapped_column(String)

    location = relationship("Location")

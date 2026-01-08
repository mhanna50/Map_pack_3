from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..db.base import Base
from .enums import ApprovalCategory, ApprovalStatus
from .mixins import TimestampMixin, UUIDPrimaryKeyMixin


class ApprovalRequest(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "approval_requests"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    location_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id")
    )
    category: Mapped[ApprovalCategory] = mapped_column(
        Enum(ApprovalCategory, name="approval_category"), nullable=False
    )
    status: Mapped[ApprovalStatus] = mapped_column(
        Enum(ApprovalStatus, name="approval_status"), nullable=False, default=ApprovalStatus.PENDING
    )
    reason: Mapped[str] = mapped_column(String(255))
    severity: Mapped[str] = mapped_column(String(32), default="normal")
    payload: Mapped[dict | None] = mapped_column(JSONB, default=dict)
    before_state: Mapped[dict | None] = mapped_column(JSONB, default=dict)
    source_json: Mapped[dict | None] = mapped_column(JSONB, default=dict)
    proposal_json: Mapped[dict | None] = mapped_column(JSONB, default=dict)
    approved_content: Mapped[str | None] = mapped_column(String)
    requested_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    resolved_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolution_notes: Mapped[str | None] = mapped_column(String(512))
    published_external_id: Mapped[str | None] = mapped_column(String(255))
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

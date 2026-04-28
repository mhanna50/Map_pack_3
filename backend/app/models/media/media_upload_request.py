from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.db.base import Base
from backend.app.models.enums import PendingChangeStatus
from backend.app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class MediaUploadRequest(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "media_upload_requests"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        "tenant_id", UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    location_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id"), nullable=False
    )
    reason: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[PendingChangeStatus] = mapped_column(
        Enum(PendingChangeStatus, name="media_request_status"),
        default=PendingChangeStatus.PENDING,
        nullable=False,
    )
    requested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    due_by: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    notified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    metadata_json: Mapped[dict | None] = mapped_column(JSONB, default=dict)

    location = relationship("Location")
    assets = relationship("MediaAsset", back_populates="upload_request")

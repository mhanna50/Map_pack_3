from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.db.base import Base
from backend.app.models.enums import PhotoRequestStatus
from backend.app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class PhotoRequest(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "photo_requests"
    __table_args__ = (
        UniqueConstraint(
            "organization_id",
            "location_id",
            name="uq_photo_request_scope",
        ),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    location_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id"), nullable=False
    )
    reason: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[PhotoRequestStatus] = mapped_column(
        Enum(PhotoRequestStatus, name="photo_request_status"),
        default=PhotoRequestStatus.PENDING,
        nullable=False,
    )
    last_requested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    next_allowed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    metadata_json: Mapped[dict | None] = mapped_column(JSONB, default=dict)

    organization = relationship("Organization")
    location = relationship("Location")

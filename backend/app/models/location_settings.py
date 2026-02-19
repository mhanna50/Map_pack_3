from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db.base import Base
from .mixins import TimestampMixin, UUIDPrimaryKeyMixin


class LocationSettings(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "location_settings"

    location_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id"), unique=True, nullable=False
    )
    posting_schedule: Mapped[dict | None] = mapped_column(JSONB, default=dict)
    voice_profile: Mapped[dict | None] = mapped_column(JSONB, default=dict)
    approvals: Mapped[dict | None] = mapped_column(JSONB, default=dict)
    services: Mapped[list | None] = mapped_column(JSONB, default=list)
    keywords: Mapped[list | None] = mapped_column(JSONB, default=list)
    competitors: Mapped[list | None] = mapped_column(JSONB, default=list)
    settings_json: Mapped[dict | None] = mapped_column(JSONB, default=dict)

    location = relationship("Location", back_populates="settings")

from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db.base import Base
from .mixins import TimestampMixin, UUIDPrimaryKeyMixin


class Contact(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "contacts"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    location_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id")
    )
    name: Mapped[str] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(32))
    email: Mapped[str | None] = mapped_column(String(255))
    tags: Mapped[list[str] | None] = mapped_column(JSONB, default=list)
    metadata_json: Mapped[dict | None] = mapped_column(JSONB, default=dict)

    organization = relationship("Organization")
    location = relationship("Location")

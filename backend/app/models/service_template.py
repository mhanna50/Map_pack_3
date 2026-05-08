from __future__ import annotations

import uuid

from sqlalchemy import Boolean, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db.base import Base
from .mixins import TimestampMixin, UUIDPrimaryKeyMixin


class ServiceTemplate(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "service_templates"

    organization_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id")
    )
    category: Mapped[str] = mapped_column(String(128), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(String)
    is_safe: Mapped[bool] = mapped_column(Boolean, default=True)
    metadata_json: Mapped[dict | None] = mapped_column(JSONB, default=dict)

    organization = relationship("Organization")

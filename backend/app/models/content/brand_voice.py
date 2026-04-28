from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.db.base import Base
from backend.app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class BrandVoice(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "brand_voice"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        "tenant_id", UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, unique=True
    )
    tone: Mapped[str | None] = mapped_column(String(128))
    do_statements: Mapped[list[str] | None] = mapped_column(JSONB, default=list)
    dont_statements: Mapped[list[str] | None] = mapped_column(JSONB, default=list)
    banned_phrases: Mapped[list[str] | None] = mapped_column(JSONB, default=list)

    organization = relationship("Organization")

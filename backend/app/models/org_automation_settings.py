from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db.base import Base
from .mixins import TimestampMixin, UUIDPrimaryKeyMixin


class OrgAutomationSettings(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "org_automation_settings"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, unique=True
    )
    settings_json: Mapped[dict | None] = mapped_column(JSONB, default=dict)

    organization = relationship("Organization")

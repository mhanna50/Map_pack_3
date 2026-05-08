from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db.base import Base
from .enums import ProviderType
from .mixins import TimestampMixin, UUIDPrimaryKeyMixin


class ConnectedAccount(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "connected_accounts"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    provider: Mapped[ProviderType] = mapped_column(
        Enum(ProviderType, name="provider_type"), nullable=False
    )
    external_account_id: Mapped[str | None] = mapped_column(String(255), index=True)
    display_name: Mapped[str | None] = mapped_column(String(255))
    scopes: Mapped[list[str] | None] = mapped_column(JSONB, default=list)
    encrypted_access_token: Mapped[str | None] = mapped_column(String)
    encrypted_refresh_token: Mapped[str | None] = mapped_column(String)
    access_token_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    metadata_json: Mapped[dict | None] = mapped_column(JSONB, default=dict)

    organization = relationship("Organization", back_populates="connected_accounts")
    locations = relationship("Location", back_populates="connected_account")
    actions = relationship("Action", back_populates="connected_account")

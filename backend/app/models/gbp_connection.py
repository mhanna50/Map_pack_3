from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db.base import Base
from .enums import GbpConnectionStatus
from .mixins import TimestampMixin, UUIDPrimaryKeyMixin


class GbpConnection(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "gbp_connections"
    __table_args__ = (
        UniqueConstraint("tenant_id", name="uq_gbp_connection_org"),
    )

    # Physical DB column is still `tenant_id` in existing environments.
    # Keep Python attribute name as `organization_id` to avoid broad refactors.
    organization_id: Mapped[uuid.UUID] = mapped_column(
        "tenant_id",
        UUID(as_uuid=True),
        ForeignKey("organizations.id"),
        nullable=False,
    )
    google_account_email: Mapped[str | None] = mapped_column(String(320))
    account_resource_name: Mapped[str | None] = mapped_column(String(255))
    scopes: Mapped[list[str] | None] = mapped_column(JSONB, default=list)
    status: Mapped[GbpConnectionStatus] = mapped_column(
        Enum(
            GbpConnectionStatus,
            name="gbp_connection_status",
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        default=GbpConnectionStatus.CONNECTED,
        nullable=False,
    )
    encrypted_access_token: Mapped[str | None] = mapped_column(String)
    encrypted_refresh_token: Mapped[str | None] = mapped_column(String)
    access_token_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    metadata_json: Mapped[dict | None] = mapped_column(JSONB, default=dict)

    organization = relationship("Organization", back_populates="gbp_connection")

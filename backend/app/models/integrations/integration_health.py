from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from backend.app.db.base import Base
from backend.app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class IntegrationHealthCheck(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "integration_health_checks"
    __table_args__ = (
        UniqueConstraint("tenant_id", "integration", "module", name="uq_integration_health_scope"),
    )

    tenant_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id"))
    integration: Mapped[str] = mapped_column(String(80), nullable=False)
    module: Mapped[str | None] = mapped_column(String(120))
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="unknown")
    severity: Mapped[str] = mapped_column(String(16), nullable=False, default="info")
    category: Mapped[str | None] = mapped_column(String(64))
    message: Mapped[str] = mapped_column(Text, nullable=False)
    safe_details: Mapped[dict | None] = mapped_column(JSONB, default=dict)
    last_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_success_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_failure_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    failure_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    recovery_attempt_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    next_retry_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_user_action_required: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    user_action_type: Mapped[str | None] = mapped_column(String(64))
    admin_action_required: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class IntegrationIncident(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "integration_incidents"

    tenant_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id"))
    integration: Mapped[str] = mapped_column(String(80), nullable=False)
    module: Mapped[str | None] = mapped_column(String(120))
    severity: Mapped[str] = mapped_column(String(16), nullable=False)
    category: Mapped[str] = mapped_column(String(64), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    safe_error_summary: Mapped[str | None] = mapped_column(Text)
    safe_details: Mapped[dict | None] = mapped_column(JSONB, default=dict)
    status: Mapped[str] = mapped_column(String(32), default="open", nullable=False)
    first_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    recovery_attempts: Mapped[list | None] = mapped_column(JSONB, default=list)
    affected_count: Mapped[int] = mapped_column(Integer, default=1, nullable=False)


class IntegrationRecoveryAttempt(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "integration_recovery_attempts"

    tenant_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id"))
    incident_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("integration_incidents.id"))
    integration: Mapped[str] = mapped_column(String(80), nullable=False)
    module: Mapped[str | None] = mapped_column(String(120))
    action: Mapped[str] = mapped_column(String(128), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    message: Mapped[str | None] = mapped_column(Text)
    safe_details: Mapped[dict | None] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ClientReconnectPrompt(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "client_reconnect_prompts"

    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    integration: Mapped[str] = mapped_column(String(80), nullable=False)
    module: Mapped[str | None] = mapped_column(String(120))
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="active", nullable=False)
    action_url: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.db.base import Base
from backend.app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class LeadRecoverySettings(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "lead_recovery_settings"
    __table_args__ = (
        UniqueConstraint("tenant_id", name="uq_lead_recovery_settings_tenant"),
        Index("ix_lead_recovery_settings_twilio_phone", "twilio_phone_number"),
        Index("ix_lead_recovery_settings_twilio_sid", "twilio_phone_sid"),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    business_phone: Mapped[str | None] = mapped_column(String(32))
    owner_notification_phone: Mapped[str | None] = mapped_column(String(32))
    owner_notification_email: Mapped[str | None] = mapped_column(String(320))
    business_name: Mapped[str | None] = mapped_column(String(255))
    twilio_phone_number: Mapped[str | None] = mapped_column(String(32))
    twilio_phone_sid: Mapped[str | None] = mapped_column(String(128))
    forwarding_status: Mapped[str] = mapped_column(String(32), default="not_configured", nullable=False)
    verification_status: Mapped[str] = mapped_column(String(32), default="not_started", nullable=False)
    last_verification_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    test_call_from_phone: Mapped[str | None] = mapped_column(String(32))
    last_test_call_sid: Mapped[str | None] = mapped_column(String(128))
    consent_confirmed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    missed_call_textback_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    intake_questions_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    owner_notifications_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    no_response_followup_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    completed_job_review_request_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class Lead(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "leads"
    __table_args__ = (
        Index("ix_leads_tenant_status", "tenant_id", "status"),
        Index("ix_leads_tenant_phone", "tenant_id", "customer_phone"),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    source: Mapped[str] = mapped_column(String(32), default="missed_call", nullable=False)
    customer_name: Mapped[str | None] = mapped_column(String(255))
    customer_phone: Mapped[str | None] = mapped_column(String(32))
    customer_email: Mapped[str | None] = mapped_column(String(320))
    service_requested: Mapped[str | None] = mapped_column(String(255))
    location: Mapped[str | None] = mapped_column(String(255))
    urgency: Mapped[str | None] = mapped_column(String(120))
    preferred_time: Mapped[str | None] = mapped_column(String(255))
    details: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(32), default="new", nullable=False)
    owner_summary: Mapped[str | None] = mapped_column(Text)
    last_message_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    messages = relationship("LeadMessage", back_populates="lead", cascade="all, delete-orphan")
    notes = relationship("LeadNote", back_populates="lead", cascade="all, delete-orphan")
    events = relationship("LeadEvent", back_populates="lead", cascade="all, delete-orphan")


class LeadMessage(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "lead_messages"
    __table_args__ = (
        Index("ix_lead_messages_tenant_lead", "tenant_id", "lead_id"),
        Index("ix_lead_messages_twilio_sid", "twilio_message_sid"),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    lead_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("leads.id"), nullable=False)
    direction: Mapped[str] = mapped_column(String(24), nullable=False)
    channel: Mapped[str] = mapped_column(String(24), nullable=False)
    body: Mapped[str | None] = mapped_column(Text)
    twilio_message_sid: Mapped[str | None] = mapped_column(String(128))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    lead = relationship("Lead", back_populates="messages")


class LeadNote(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "lead_notes"
    __table_args__ = (Index("ix_lead_notes_tenant_lead", "tenant_id", "lead_id"),)

    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    lead_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("leads.id"), nullable=False)
    note: Mapped[str] = mapped_column(Text, nullable=False)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    lead = relationship("Lead", back_populates="notes")


class LeadEvent(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "lead_events"
    __table_args__ = (
        Index("ix_lead_events_tenant_lead", "tenant_id", "lead_id"),
        Index("ix_lead_events_type", "event_type"),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    lead_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("leads.id"))
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    payload: Mapped[dict | None] = mapped_column("payload_json", JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    lead = relationship("Lead", back_populates="events")

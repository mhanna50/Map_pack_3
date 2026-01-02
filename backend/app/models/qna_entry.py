from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db.base import Base
from .enums import QnaStatus
from .mixins import TimestampMixin, UUIDPrimaryKeyMixin


class QnaEntry(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "qna_entries"
    __table_args__ = (
        Index("ix_qna_location", "location_id"),
        Index("ix_qna_question", "question"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    location_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id"), nullable=False
    )
    connected_account_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("connected_accounts.id")
    )
    question: Mapped[str] = mapped_column(String, nullable=False)
    answer: Mapped[str] = mapped_column(String, nullable=False)
    category: Mapped[str | None] = mapped_column(String(128))
    keywords: Mapped[list[str] | None] = mapped_column(JSONB, default=list)
    competitor_notes: Mapped[str | None] = mapped_column(String)
    status: Mapped[QnaStatus] = mapped_column(
        Enum(QnaStatus, name="qna_status"), default=QnaStatus.DRAFT, nullable=False
    )
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    posted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_refreshed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    metadata_json: Mapped[dict | None] = mapped_column(JSONB, default=dict)

    organization = relationship("Organization")
    location = relationship("Location")
    connected_account = relationship("ConnectedAccount")

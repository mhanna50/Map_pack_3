from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.db.base import Base
from backend.app.models.enums import PostJobStatus
from backend.app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class PostAttempt(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "post_attempts"

    post_job_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("post_jobs.id"), nullable=False
    )
    status: Mapped[PostJobStatus] = mapped_column(
        Enum(PostJobStatus, name="post_job_status"), nullable=False
    )
    error: Mapped[str | None] = mapped_column(String)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    metadata_json: Mapped[dict | None] = mapped_column(JSONB, default=dict)

    job = relationship("PostJob")

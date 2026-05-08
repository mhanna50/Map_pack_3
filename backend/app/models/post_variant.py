from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db.base import Base
from .mixins import TimestampMixin, UUIDPrimaryKeyMixin


class PostVariant(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "post_variants"

    post_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("posts.id", ondelete="CASCADE"), nullable=False
    )
    source: Mapped[str] = mapped_column(String(64), default="ai")
    body: Mapped[str] = mapped_column(String)
    compliance_flags: Mapped[dict | None] = mapped_column(JSONB, default=dict)
    scores: Mapped[dict | None] = mapped_column(JSONB, default=dict)

    post = relationship("Post", back_populates="variants")

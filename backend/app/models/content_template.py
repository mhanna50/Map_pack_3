from __future__ import annotations

from sqlalchemy import Enum, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from ..db.base import Base
from .enums import PostType
from .mixins import TimestampMixin, UUIDPrimaryKeyMixin


class ContentTemplate(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "content_templates"

    industry: Mapped[str] = mapped_column(String(128), nullable=False)
    bucket: Mapped[str] = mapped_column(String(64), nullable=False)
    topic: Mapped[str | None] = mapped_column(String(128))
    post_type: Mapped[PostType] = mapped_column(Enum(PostType, name="post_type"), nullable=False)
    prompt_template: Mapped[str] = mapped_column(String, nullable=False)
    guardrails_json: Mapped[dict | None] = mapped_column(JSONB, default=dict)

from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, String, event, select
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.db.base import Base
from backend.app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class PostVariant(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "post_variants"

    tenant_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=False)
    post_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("posts.id", ondelete="CASCADE"), nullable=False
    )
    source: Mapped[str] = mapped_column(String(64), default="ai")
    body: Mapped[str] = mapped_column(String)
    compliance_flags: Mapped[dict | None] = mapped_column(JSONB, default=dict)
    scores: Mapped[dict | None] = mapped_column(JSONB, default=dict)

    post = relationship("Post", back_populates="variants")


@event.listens_for(PostVariant, "before_insert")
@event.listens_for(PostVariant, "before_update")
def _sync_post_variant_tenant_id(_mapper, connection, target: PostVariant) -> None:
    if target.tenant_id is not None:
        return
    if target.post is not None:
        target.tenant_id = target.post.organization_id
        return
    if target.post_id is None:
        return
    from backend.app.models.posts.post import Post

    target.tenant_id = connection.execute(
        select(Post.__table__.c.tenant_id).where(Post.__table__.c.id == target.post_id)
    ).scalar_one_or_none()

from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, event, select
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.db.base import Base
from backend.app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class PostMediaAttachment(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "post_media_attachments"

    tenant_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=False)
    post_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("posts.id", ondelete="CASCADE"), nullable=False
    )
    media_asset_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("media_assets.id", ondelete="SET NULL"),
        nullable=False,
    )

    post = relationship("Post", back_populates="attachments")
    media_asset = relationship("MediaAsset")


@event.listens_for(PostMediaAttachment, "before_insert")
@event.listens_for(PostMediaAttachment, "before_update")
def _sync_post_media_attachment_tenant_id(_mapper, connection, target: PostMediaAttachment) -> None:
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

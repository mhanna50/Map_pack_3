from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db.base import Base
from .enums import MembershipRole
from .mixins import TimestampMixin, UUIDPrimaryKeyMixin


class OrganizationInvite(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "organization_invites"
    __table_args__ = (
        UniqueConstraint("organization_id", "email", name="uq_invite_org_email"),
        UniqueConstraint("token_hash", name="uq_invite_token"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    invited_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id")
    )
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    role: Mapped[MembershipRole] = mapped_column(
        Enum(MembershipRole, name="invite_role"), nullable=False
    )
    token_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    organization = relationship("Organization")
    invited_by = relationship("User")

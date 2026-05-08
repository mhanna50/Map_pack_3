from __future__ import annotations

import uuid

from sqlalchemy import Enum, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db.base import Base
from .enums import MembershipRole
from .mixins import TimestampMixin, UUIDPrimaryKeyMixin


class Membership(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "memberships"
    __table_args__ = (
        UniqueConstraint("user_id", "tenant_id", name="uq_membership_user_org"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    # Physical DB column is still `tenant_id` in existing environments.
    # Keep Python attribute name as `organization_id` to avoid broad refactors.
    organization_id: Mapped[uuid.UUID] = mapped_column(
        "tenant_id",
        UUID(as_uuid=True),
        ForeignKey("organizations.id"),
        nullable=False,
    )
    role: Mapped[MembershipRole] = mapped_column(
        Enum(
            MembershipRole,
            name="membership_role",
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
    )

    user = relationship("User", back_populates="memberships")
    organization = relationship("Organization", back_populates="memberships")

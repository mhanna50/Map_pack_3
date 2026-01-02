from __future__ import annotations

from sqlalchemy import Enum, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db.base import Base
from .enums import OrganizationType
from .mixins import TimestampMixin, UUIDPrimaryKeyMixin


class Organization(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "organizations"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    org_type: Mapped[OrganizationType] = mapped_column(
        Enum(OrganizationType, name="organization_type"),
        nullable=False,
        default=OrganizationType.AGENCY,
    )
    slug: Mapped[str | None] = mapped_column(String(255), unique=True)
    metadata_json: Mapped[dict | None] = mapped_column(JSONB, default=dict)
    plan_tier: Mapped[str | None] = mapped_column(String(64), default="starter")
    usage_limits_json: Mapped[dict | None] = mapped_column(JSONB, default=dict)

    locations = relationship("Location", back_populates="organization")
    memberships = relationship("Membership", back_populates="organization")
    connected_accounts = relationship("ConnectedAccount", back_populates="organization")
    audit_logs = relationship("AuditLog", back_populates="organization")
    actions = relationship("Action", back_populates="organization")

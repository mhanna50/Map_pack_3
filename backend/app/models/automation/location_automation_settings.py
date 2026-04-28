from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, event, select
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.db.base import Base
from backend.app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class LocationAutomationSettings(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "location_automation_settings"

    tenant_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=False)
    location_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id"), nullable=False, unique=True
    )
    settings_json: Mapped[dict | None] = mapped_column(JSONB, default=dict)

    location = relationship("Location")


@event.listens_for(LocationAutomationSettings, "before_insert")
@event.listens_for(LocationAutomationSettings, "before_update")
def _sync_location_automation_settings_tenant_id(
    _mapper, connection, target: LocationAutomationSettings
) -> None:
    if target.tenant_id is not None:
        return
    if target.location is not None:
        target.tenant_id = target.location.tenant_id or target.location.organization_id
        return
    if target.location_id is None:
        return
    from backend.app.models.google_business.location import Location

    target.tenant_id = connection.execute(
        select(Location.__table__.c.tenant_id).where(Location.__table__.c.id == target.location_id)
    ).scalar_one_or_none()

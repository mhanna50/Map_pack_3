from __future__ import annotations

from sqlalchemy.orm import Session

from ..models.enums import LocationStatus
from ..models.location import Location
from ..models.location_settings import LocationSettings


class LocationOnboardingService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def connect_google_location(
        self,
        *,
        organization_id,
        connected_account_id,
        location_payload: dict,
    ) -> Location:
        google_location_id = location_payload.get("name")
        if not google_location_id:
            raise ValueError("Google API response missing location name")
        location = (
            self.db.query(Location)
            .filter(
                Location.organization_id == organization_id,
                Location.google_location_id == google_location_id,
            )
            .one_or_none()
        )
        address_payload = (
            location_payload.get("storefrontAddress")
            or location_payload.get("address")
            or {}
        )
        if location:
            location.name = location_payload.get("title", location.name)
            location.address = address_payload
            location.connected_account_id = connected_account_id
            location.status = LocationStatus.ACTIVE
        else:
            timezone = (
                location_payload.get("regularHours", {}).get("timezone")
                or location_payload.get("specialHours", {}).get("timezone")
                or "UTC"
            )
            location = Location(
                organization_id=organization_id,
                connected_account_id=connected_account_id,
                name=location_payload.get("title") or "Google Location",
                timezone=timezone,
                google_location_id=google_location_id,
                address=address_payload,
                status=LocationStatus.ACTIVE,
            )
            self.db.add(location)
            self.db.flush()

        if not location.settings:
            primary_category = (
                location_payload.get("categories", {})
                .get("primaryCategory", {})
                .get("displayName")
            )
            services = [primary_category] if primary_category else []
            settings = LocationSettings(
                location_id=location.id,
                services=services,
            )
            self.db.add(settings)

        self.db.commit()
        self.db.refresh(location)
        return location

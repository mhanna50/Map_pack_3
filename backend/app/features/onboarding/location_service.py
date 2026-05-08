from __future__ import annotations

from sqlalchemy.orm import Session

from backend.app.models.enums import LocationStatus
from backend.app.models.google_business.location import Location
from backend.app.models.google_business.location_settings import LocationSettings


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
        profile_payload = self._profile_payload(location_payload, address_payload)
        if location:
            location.tenant_id = organization_id
            location.name = location_payload.get("title", location.name)
            location.address = profile_payload
            location.connected_account_id = connected_account_id
            location.status = LocationStatus.ACTIVE
        else:
            timezone = (
                location_payload.get("regularHours", {}).get("timezone")
                or location_payload.get("specialHours", {}).get("timezone")
                or "UTC"
            )
            location = Location(
                tenant_id=organization_id,
                organization_id=organization_id,
                connected_account_id=connected_account_id,
                name=location_payload.get("title") or "Google Location",
                timezone=timezone,
                google_location_id=google_location_id,
                address=profile_payload,
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
                tenant_id=organization_id,
                location_id=location.id,
                services=services,
            )
            self.db.add(settings)

        self.db.commit()
        self.db.refresh(location)
        from backend.app.services.google_business.readiness import GbpReadinessService

        GbpReadinessService(self.db).schedule_audit_if_lifecycle_ready(
            organization_id=organization_id,
            location_id=location.id,
            trigger_source="onboarding",
            force=True,
        )
        return location

    @staticmethod
    def _profile_payload(location_payload: dict, address_payload: dict) -> dict:
        profile = dict(address_payload or {})
        for key in (
            "categories",
            "serviceArea",
            "serviceItems",
            "regularHours",
            "specialHours",
            "websiteUri",
            "phoneNumbers",
            "profile",
            "metadata",
        ):
            if key in location_payload:
                profile[key] = location_payload.get(key)
        return profile

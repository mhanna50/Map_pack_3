from __future__ import annotations

import uuid
from datetime import datetime, timezone
from functools import lru_cache
from typing import Any

from sqlalchemy.orm import Session

from backend.app.models.google_business.org_settings import OrgSettings
from backend.app.models.google_business.location_settings import LocationSettings


DEFAULT_SETTINGS = {
    "tone_of_voice": "friendly",
    "content_mix": {
        "service_spotlight": 0.3,
        "proof": 0.2,
        "faq": 0.15,
        "offer": 0.15,
        "local_highlight": 0.1,
        "seasonal_tip": 0.1,
    },
    "business_hours": {
        "mon": ["09:00", "17:00"],
        "tue": ["09:00", "17:00"],
        "wed": ["09:00", "17:00"],
        "thu": ["09:00", "17:00"],
        "fri": ["09:00", "17:00"],
    },
    "cooldowns": {"bucket_days": 14, "topic_days": 21},
    "banned_phrases": [],
    "cta_style": "direct",
    "photo_cadence_days": 14,
    "photo_reuse_gap_days": 14,
    "verified_offers": [],
    "verified_events": [],
}


class SettingsService:
    def __init__(self, db: Session) -> None:
        self.db = db

    @lru_cache(maxsize=512)
    def merged(self, organization_id: uuid.UUID, location_id: uuid.UUID | None = None) -> dict[str, Any]:
        org_settings = (
            self.db.query(OrgSettings)
            .filter(OrgSettings.organization_id == organization_id)
            .one_or_none()
        )
        loc_settings = (
            self.db.query(LocationSettings)
            .filter(LocationSettings.location_id == location_id)
            .one_or_none()
            if location_id
            else None
        )
        merged = DEFAULT_SETTINGS | (org_settings.settings_json if org_settings and org_settings.settings_json else {})
        if loc_settings and loc_settings.settings_json:
            merged |= loc_settings.settings_json
        # ensure banned_phrases is a list
        merged["banned_phrases"] = list(merged.get("banned_phrases") or [])
        return merged

    def invalidate(self) -> None:
        self.merged.cache_clear()

    def verified_offers(
        self, organization_id: uuid.UUID, location_id: uuid.UUID | None = None, *, as_of: datetime | None = None
    ) -> list[dict[str, Any]]:
        merged = self.merged(organization_id, location_id)
        as_of = as_of or datetime.now(timezone.utc)
        offers = merged.get("verified_offers") or []
        legacy = merged.get("offers") or []
        return [
            offer
            for offer in self._normalized_campaigns([*offers, *legacy], expected_type="offer")
            if self._is_active(offer, as_of=as_of)
        ]

    def verified_events(
        self, organization_id: uuid.UUID, location_id: uuid.UUID | None = None, *, as_of: datetime | None = None
    ) -> list[dict[str, Any]]:
        merged = self.merged(organization_id, location_id)
        as_of = as_of or datetime.now(timezone.utc)
        events = merged.get("verified_events") or []
        legacy = merged.get("events") or []
        return [
            event
            for event in self._normalized_campaigns([*events, *legacy], expected_type="event")
            if self._is_active(event, as_of=as_of)
        ]

    @staticmethod
    def _normalized_campaigns(raw_items: list[Any], *, expected_type: str) -> list[dict[str, Any]]:
        items: list[dict[str, Any]] = []
        for entry in raw_items:
            if isinstance(entry, str):
                items.append({"title": entry, "verified": True, "type": expected_type})
            elif isinstance(entry, dict):
                normalized = dict(entry)
                if "verified" not in normalized:
                    normalized["verified"] = True
                if "type" not in normalized:
                    normalized["type"] = expected_type
                items.append(normalized)
        return [item for item in items if item.get("verified") is True and item.get("type") == expected_type]

    @staticmethod
    def _is_active(campaign: dict[str, Any], *, as_of: datetime) -> bool:
        starts = SettingsService._parse_datetime(
            campaign.get("start_date") or campaign.get("start_at") or campaign.get("starts_at")
        )
        ends = SettingsService._parse_datetime(
            campaign.get("end_date") or campaign.get("end_at") or campaign.get("ends_at")
        )
        if starts and as_of < starts:
            return False
        if ends and as_of > ends:
            return False
        return True

    @staticmethod
    def _parse_datetime(raw: Any) -> datetime | None:
        if raw is None:
            return None
        if isinstance(raw, datetime):
            return raw if raw.tzinfo else raw.replace(tzinfo=timezone.utc)
        if not isinstance(raw, str):
            return None
        value = raw.strip()
        if not value:
            return None
        try:
            if len(value) == 10 and value.count("-") == 2:
                value = f"{value}T00:00:00+00:00"
            value = value.replace("Z", "+00:00")
            parsed = datetime.fromisoformat(value)
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
        except Exception:  # noqa: BLE001
            return None

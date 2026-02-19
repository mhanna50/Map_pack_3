from __future__ import annotations

import uuid
from functools import lru_cache
from typing import Any

from sqlalchemy.orm import Session

from backend.app.models.org_settings import OrgSettings
from backend.app.models.location_settings import LocationSettings


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

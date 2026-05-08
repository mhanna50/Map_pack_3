from __future__ import annotations

from copy import deepcopy
from datetime import datetime
from typing import Any
import uuid

from sqlalchemy.orm import Session

from backend.app.models.org_automation_settings import OrgAutomationSettings
from backend.app.services.jobs import JobService
from backend.app.services.audit import log_audit


AUTOMATION_DEFINITIONS: dict[str, dict[str, Any]] = {
    "posts": {
        "label": "Posts",
        "job_type": "post_update",
        "default_enabled": True,
        "default_config": {"cadence_days": 7},
    },
    "review_replies": {
        "label": "Review replies",
        "job_type": "sync_reviews",
        "default_enabled": True,
        "default_config": {"sla_hours": 24},
    },
    "qna": {
        "label": "Q&A",
        "job_type": "optimize_services",
        "default_enabled": False,
        "default_config": {"topics": []},
    },
    "rank_scans": {
        "label": "Rank scans",
        "job_type": "rank_scan",
        "default_enabled": True,
        "default_config": {"frequency_hours": 24},
    },
}


class AutomationSettingsService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.jobs = JobService(db)

    def list_org_automations(self, organization_id: uuid.UUID) -> list[dict[str, Any]]:
        settings = self._load_org_settings(organization_id)
        last_runs = self.jobs.latest_runs(
            organization_id,
            [definition["job_type"] for definition in AUTOMATION_DEFINITIONS.values()],
        )
        items: list[dict[str, Any]] = []
        for key, definition in AUTOMATION_DEFINITIONS.items():
            merged = self._merge_defaults(definition, settings.get(key, {}))
            job_meta = last_runs.get(definition["job_type"], {})
            items.append(
                {
                    "type": key,
                    "label": definition["label"],
                    "enabled": merged["enabled"],
                    "config": merged["config"],
                    "job_type": definition["job_type"],
                    "last_run_at": job_meta.get("last_run_at"),
                    "last_status": job_meta.get("last_status"),
                    "next_run_at": job_meta.get("next_run_at"),
                }
            )
        return items

    def update_org_automations(
        self,
        organization_id: uuid.UUID,
        updates: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        record = (
            self.db.query(OrgAutomationSettings)
            .filter(OrgAutomationSettings.organization_id == organization_id)
            .one_or_none()
        )
        if not record:
            record = OrgAutomationSettings(organization_id=organization_id, settings_json={})
            self.db.add(record)
            self.db.flush()
        settings = dict(record.settings_json or {})
        for update in updates:
            automation_type = update.get("type")
            if automation_type not in AUTOMATION_DEFINITIONS:
                continue
            current = settings.get(automation_type, {})
            before_state = self._merge_defaults(AUTOMATION_DEFINITIONS[automation_type], current)
            if "enabled" in update and update["enabled"] is not None:
                current["enabled"] = update["enabled"]
            if "config" in update and update["config"] is not None:
                config = dict(current.get("config") or {})
                config.update(update["config"])
                current["config"] = config
            settings[automation_type] = current
            after_state = self._merge_defaults(AUTOMATION_DEFINITIONS[automation_type], current)
            if before_state != after_state:
                log_audit(
                    self.db,
                    action="automation.toggled",
                    org_id=organization_id,
                    entity="automation",
                    entity_id=automation_type,
                    before=before_state,
                    after=after_state,
                )
        record.settings_json = settings
        self.db.add(record)
        self.db.commit()
        self.db.refresh(record)
        return self.list_org_automations(organization_id)

    def _load_org_settings(self, organization_id: uuid.UUID) -> dict[str, Any]:
        record = (
            self.db.query(OrgAutomationSettings)
            .filter(OrgAutomationSettings.organization_id == organization_id)
            .one_or_none()
        )
        return dict(record.settings_json or {}) if record else {}

    @staticmethod
    def _merge_defaults(definition: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
        merged = {
            "enabled": override.get("enabled", definition["default_enabled"]),
            "config": deepcopy(definition["default_config"]),
        }
        override_config = override.get("config") or {}
        merged["config"].update(override_config)
        return merged

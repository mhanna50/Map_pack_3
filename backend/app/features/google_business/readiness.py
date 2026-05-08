from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
import uuid

from sqlalchemy.orm import Session

from backend.app.models.automation.action import Action
from backend.app.models.automation.org_automation_settings import OrgAutomationSettings
from backend.app.models.billing.billing_subscription import BillingSubscription
from backend.app.models.enums import (
    ActionStatus,
    ActionType,
    GbpAutomationStatus,
    GbpConnectionStatus,
    LocationStatus,
)
from backend.app.models.google_business.gbp_connection import GbpConnection
from backend.app.models.google_business.listing_audit import ListingAudit
from backend.app.models.google_business.location import Location
from backend.app.models.identity.organization import Organization
from backend.app.models.rank_tracking.gbp_post_keyword_mapping import GbpPostKeywordMapping

ACTIVE_BILLING_STATUSES = {"active", "trialing"}
RESOLVED_AUDIT_ITEM_STATUSES = {"complete", "dismissed", "auto_updated"}
READY_STATUSES = {
    GbpAutomationStatus.READY_FOR_AUTOMATION.value,
    GbpAutomationStatus.AUTOMATION_ACTIVE.value,
}
DEFAULT_AUTOMATION_ENABLED = {
    "posts": True,
    "review_replies": True,
    "qna": False,
    "rank_scans": True,
}


class GbpReadinessService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def schedule_audit_if_lifecycle_ready(
        self,
        *,
        organization_id: uuid.UUID,
        location_id: uuid.UUID | None = None,
        trigger_source: str,
        force: bool = False,
    ) -> int:
        locations = self._locations_for_lifecycle_event(organization_id=organization_id, location_id=location_id)
        scheduled = 0
        for location in locations:
            state = self.calculate(organization_id=organization_id, location_id=location.id, persist=True)
            if not state["gbp_connected"] or not state["subscription_active"]:
                continue
            if not force and state["status"] not in {
                GbpAutomationStatus.AUDIT_REQUIRED.value,
                GbpAutomationStatus.AUDIT_IN_PROGRESS.value,
            }:
                continue
            latest = self._latest_audit(organization_id=organization_id, location_id=location.id)
            if latest and latest.status == "completed" and not force:
                continue
            if self._has_pending_audit_action(organization_id=organization_id, location_id=location.id):
                self._persist(location, GbpAutomationStatus.AUDIT_IN_PROGRESS, state)
                continue
            from backend.app.services.automation.actions import ActionService

            now = datetime.now(timezone.utc)
            ActionService(self.db).schedule_action(
                organization_id=organization_id,
                location_id=location.id,
                action_type=ActionType.RUN_GBP_AUDIT,
                run_at=now,
                payload={"location_id": str(location.id), "trigger_source": trigger_source},
                dedupe_key=(
                    f"gbp_audit:{trigger_source}:{location.id}:{int(now.timestamp())}"
                    if force
                    else f"gbp_audit:{trigger_source}:{location.id}"
                ),
                priority=50,
            )
            state["status"] = GbpAutomationStatus.AUDIT_IN_PROGRESS.value
            state["blocking_reasons"] = ["audit_in_progress"]
            self._persist(location, GbpAutomationStatus.AUDIT_IN_PROGRESS, state)
            scheduled += 1
        return scheduled

    def calculate(self, *, organization_id: uuid.UUID, location_id: uuid.UUID, persist: bool = False) -> dict[str, Any]:
        org = self.db.get(Organization, organization_id)
        location = self.db.get(Location, location_id)
        if not org or not location:
            raise ValueError("Organization or location not found")

        connection = self._connection(organization_id)
        subscription_active = self._subscription_active(org)
        gbp_connected = self._gbp_connected(location=location, connection=connection)
        latest = self._latest_audit(organization_id=organization_id, location_id=location_id)
        pending_audit = self._has_pending_audit_action(organization_id=organization_id, location_id=location_id)
        unresolved_items = self._unresolved_audit_items(latest)

        blocking_reasons: list[str] = []
        status = GbpAutomationStatus.READY_FOR_AUTOMATION
        if not gbp_connected:
            status = GbpAutomationStatus.PENDING_GBP_CONNECTION
            blocking_reasons.append("gbp_connection_required")
        elif not subscription_active:
            status = GbpAutomationStatus.AUDIT_REQUIRED
            blocking_reasons.append("active_subscription_required")
        elif not latest or latest.status != "completed":
            if pending_audit or (latest and latest.status in {"queued", "running"}):
                status = GbpAutomationStatus.AUDIT_IN_PROGRESS
                blocking_reasons.append("audit_in_progress")
            else:
                status = GbpAutomationStatus.AUDIT_REQUIRED
                blocking_reasons.append("deep_audit_required")
        elif unresolved_items:
            status = GbpAutomationStatus.SETUP_ACTION_REQUIRED
            blocking_reasons.append("setup_actions_required")

        if status == GbpAutomationStatus.READY_FOR_AUTOMATION:
            current = getattr(location.automation_status, "value", location.automation_status)
            if current == GbpAutomationStatus.AUTOMATION_ACTIVE.value:
                status = GbpAutomationStatus.AUTOMATION_ACTIVE

        state = {
            "status": status.value,
            "ready": status.value in READY_STATUSES,
            "gbp_connected": gbp_connected,
            "subscription_active": subscription_active,
            "audit_completed": bool(latest and latest.status == "completed"),
            "audit_id": str(latest.id) if latest else None,
            "blocking_reasons": blocking_reasons,
            "missing_setup_items": [self._audit_item_payload(item) for item in unresolved_items],
            "auto_fixed_items": [
                self._audit_item_payload(item)
                for item in (latest.items if latest else [])
                if item.status == "auto_updated"
            ],
            "user_action_required_items": [
                self._audit_item_payload(item)
                for item in unresolved_items
                if item.user_action_required
            ],
            "connection_status": connection.status.value if connection else None,
            "checked_at": datetime.now(timezone.utc).isoformat(),
            "cta_path": "/dashboard/gbp-audit",
        }
        if persist:
            self._persist(location, status, state)
        return state

    def ensure_ready_for_automation(self, *, organization_id: uuid.UUID, location_id: uuid.UUID) -> dict[str, Any]:
        state = self.calculate(organization_id=organization_id, location_id=location_id, persist=True)
        if not state["ready"]:
            raise ValueError(f"GBP automation is not ready: {state['status']}")
        return state

    def after_audit_completed(self, *, organization_id: uuid.UUID, location_id: uuid.UUID) -> dict[str, Any]:
        state = self.calculate(organization_id=organization_id, location_id=location_id, persist=True)
        if state["ready"]:
            self.activate_ready_automations(organization_id=organization_id, location_id=location_id)
            state = self.calculate(organization_id=organization_id, location_id=location_id, persist=True)
        return state

    def activate_ready_automations(self, *, organization_id: uuid.UUID, location_id: uuid.UUID) -> dict[str, Any]:
        state = self.ensure_ready_for_automation(organization_id=organization_id, location_id=location_id)
        location = self.db.get(Location, location_id)
        if not location:
            raise ValueError("Location not found")
        scheduled: list[str] = []
        now = datetime.now(timezone.utc)

        if self._automation_enabled(organization_id, "posts"):
            if not self._has_current_month_keyword_action(organization_id=organization_id, location_id=location_id):
                from backend.app.services.automation.actions import ActionService

                action_service = ActionService(self.db)
                action_service.schedule_action(
                    organization_id=organization_id,
                    location_id=location_id,
                    action_type=ActionType.RUN_KEYWORD_CAMPAIGN,
                    run_at=now,
                    payload={
                        "organization_id": str(organization_id),
                        "location_id": str(location_id),
                        "cycle_year": now.year,
                        "cycle_month": now.month,
                        "trigger_source": "readiness",
                        "onboarding_triggered": True,
                    },
                    dedupe_key=f"keyword-readiness-action:{organization_id}:{location_id}:{now.year:04d}-{now.month:02d}",
                    priority=40,
                )
                scheduled.append("keyword_campaign")
            elif self._has_planned_post_mappings(organization_id=organization_id, location_id=location_id):
                self._schedule_content_planning(organization_id=organization_id, location_id=location_id)
                scheduled.append("content_planning")

        if self._automation_enabled(organization_id, "review_replies"):
            from backend.app.services.automation.actions import ActionService

            ActionService(self.db).schedule_action(
                organization_id=organization_id,
                location_id=location_id,
                action_type=ActionType.SYNC_GBP_REVIEWS,
                run_at=now,
                payload={"location_id": str(location_id), "trigger_source": "readiness"},
                dedupe_key=f"sync-reviews-readiness:{organization_id}:{location_id}",
                priority=20,
            )
            scheduled.append("review_sync")

        state = {**state, "activated_automations": scheduled}
        self._persist(location, GbpAutomationStatus.AUTOMATION_ACTIVE, state)
        return state

    def schedule_content_planning_after_keyword_cycle(self, *, organization_id: uuid.UUID, location_id: uuid.UUID) -> None:
        if not self._automation_enabled(organization_id, "posts"):
            return
        self.ensure_ready_for_automation(organization_id=organization_id, location_id=location_id)
        self._schedule_content_planning(organization_id=organization_id, location_id=location_id)

    def _schedule_content_planning(self, *, organization_id: uuid.UUID, location_id: uuid.UUID) -> None:
        from backend.app.services.automation.actions import ActionService

        now = datetime.now(timezone.utc)
        ActionService(self.db).schedule_action(
            organization_id=organization_id,
            location_id=location_id,
            action_type=ActionType.PLAN_CONTENT,
            run_at=now,
            payload={"horizon_days": 31, "location_id": str(location_id), "trigger_source": "readiness"},
            dedupe_key=f"plan-content-readiness:{organization_id}:{location_id}:{now.year:04d}-{now.month:02d}",
            priority=30,
        )

    def _locations_for_lifecycle_event(
        self, *, organization_id: uuid.UUID, location_id: uuid.UUID | None
    ) -> list[Location]:
        query = self.db.query(Location).filter(Location.organization_id == organization_id)
        if location_id:
            query = query.filter(Location.id == location_id)
        return (
            query.filter(Location.status == LocationStatus.ACTIVE)
            .filter(Location.google_location_id != None)  # noqa: E711
            .all()
        )

    def _persist(self, location: Location, status: GbpAutomationStatus, state: dict[str, Any]) -> None:
        location.automation_status = status
        location.readiness_json = state
        location.readiness_checked_at = datetime.now(timezone.utc)
        self.db.add(location)
        self.db.commit()

    def _connection(self, organization_id: uuid.UUID) -> GbpConnection | None:
        return (
            self.db.query(GbpConnection)
            .filter(GbpConnection.organization_id == organization_id)
            .one_or_none()
        )

    def _gbp_connected(self, *, location: Location, connection: GbpConnection | None) -> bool:
        if not location.google_location_id:
            return False
        return connection is None or connection.status == GbpConnectionStatus.CONNECTED

    def _subscription_active(self, org: Organization) -> bool:
        if not org.is_active:
            return False
        subscription = (
            self.db.query(BillingSubscription)
            .filter(BillingSubscription.tenant_id == org.id)
            .one_or_none()
        )
        if subscription and str(subscription.status or "").lower() not in ACTIVE_BILLING_STATUSES:
            return False
        metadata = org.metadata_json or {}
        normalized = str(metadata.get("normalized_subscription_status") or "").lower()
        if normalized and normalized not in ACTIVE_BILLING_STATUSES:
            return False
        return True

    def _latest_audit(self, *, organization_id: uuid.UUID, location_id: uuid.UUID) -> ListingAudit | None:
        return (
            self.db.query(ListingAudit)
            .filter(ListingAudit.organization_id == organization_id, ListingAudit.location_id == location_id)
            .order_by(ListingAudit.audited_at.desc(), ListingAudit.created_at.desc())
            .first()
        )

    def _has_pending_audit_action(self, *, organization_id: uuid.UUID, location_id: uuid.UUID) -> bool:
        return (
            self.db.query(Action)
            .filter(
                Action.organization_id == organization_id,
                Action.location_id == location_id,
                Action.action_type == ActionType.RUN_GBP_AUDIT,
                Action.status.in_([ActionStatus.PENDING, ActionStatus.QUEUED, ActionStatus.RUNNING]),
            )
            .first()
            is not None
        )

    def _unresolved_audit_items(self, audit: ListingAudit | None) -> list[Any]:
        if not audit or audit.status != "completed":
            return []
        return [item for item in audit.items if item.status not in RESOLVED_AUDIT_ITEM_STATUSES]

    def _has_current_month_keyword_action(self, *, organization_id: uuid.UUID, location_id: uuid.UUID) -> bool:
        now = datetime.now(timezone.utc)
        dedupe = f"keyword-readiness-action:{organization_id}:{location_id}:{now.year:04d}-{now.month:02d}"
        return self.db.query(Action).filter(Action.dedupe_key == dedupe).one_or_none() is not None

    def _has_planned_post_mappings(self, *, organization_id: uuid.UUID, location_id: uuid.UUID) -> bool:
        return (
            self.db.query(GbpPostKeywordMapping)
            .filter(
                GbpPostKeywordMapping.organization_id == organization_id,
                GbpPostKeywordMapping.location_id == location_id,
                GbpPostKeywordMapping.status.in_(["planned", "queued"]),
            )
            .first()
            is not None
        )

    def _automation_enabled(self, organization_id: uuid.UUID, key: str) -> bool:
        record = (
            self.db.query(OrgAutomationSettings)
            .filter(OrgAutomationSettings.organization_id == organization_id)
            .one_or_none()
        )
        raw = (record.settings_json or {}).get(key) if record else {}
        if isinstance(raw, dict) and "enabled" in raw:
            return bool(raw["enabled"])
        return DEFAULT_AUTOMATION_ENABLED.get(key, False)

    @staticmethod
    def _audit_item_payload(item: Any) -> dict[str, Any]:
        return {
            "id": str(item.id),
            "field_name": item.field_name,
            "title": item.title,
            "status": item.status,
            "auto_fixable": item.auto_fixable,
            "user_action_required": item.user_action_required,
            "severity": item.severity,
        }

from __future__ import annotations

from calendar import monthrange
from datetime import datetime, timezone
from typing import Any, Sequence
import uuid

from sqlalchemy.orm import Session

from backend.app.models.automation.action import Action
from backend.app.models.enums import ActionType, AlertSeverity, LocationStatus, PendingChangeStatus, PendingChangeType, QnaStatus
from backend.app.models.google_business.attribute_template import AttributeTemplate
from backend.app.models.google_business.business_service import BusinessService
from backend.app.models.google_business.listing_audit import ListingAudit
from backend.app.models.google_business.listing_audit_item import ListingAuditItem
from backend.app.models.google_business.location import Location
from backend.app.models.google_business.pending_change import PendingChange
from backend.app.models.google_business.qna_entry import QnaEntry
from backend.app.models.google_business.service_template import ServiceTemplate
from backend.app.models.media.media_asset import MediaAsset
from backend.app.models.rank_tracking.gbp_optimization_action import GbpOptimizationAction
from backend.app.models.rank_tracking.selected_keyword import SelectedKeyword
from backend.app.services.operations.alerts import AlertService
from backend.app.services.operations.audit import AuditService
from backend.app.services.shared.validators import assert_location_in_org

AUTO_FIELDS = {"business_description", "service_descriptions", "qna_section"}
USER_FIELDS = {
    "primary_category",
    "secondary_categories",
    "services",
    "attributes",
    "hours",
    "phone",
    "website_url",
    "photos",
    "address",
}
RESOLVED_ITEM_STATUSES = {"complete", "dismissed", "auto_updated"}
FIELD_WEIGHTS = {
    "primary_category": 12,
    "secondary_categories": 8,
    "services": 12,
    "service_descriptions": 10,
    "business_description": 12,
    "attributes": 9,
    "hours": 9,
    "phone": 8,
    "website_url": 8,
    "photos": 8,
    "qna_section": 4,
}


class ListingOptimizationService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.alerts = AlertService(db)
        self.audit_log = AuditService(db)

    def audit_listing(
        self,
        *,
        organization_id: uuid.UUID,
        location_id: uuid.UUID,
        category: str,
        current_services: Sequence[str],
        current_attributes: Sequence[str],
        description: str,
        photos_count: int,
        hours_status: str,
    ) -> ListingAudit:
        overrides = {
            "primary_category": category,
            "services": list(current_services),
            "attributes": list(current_attributes),
            "business_description": description,
            "photos_count": photos_count,
            "hours": hours_status,
        }
        return self.run_full_audit(
            organization_id=organization_id,
            location_id=location_id,
            trigger_source="manual",
            overrides=overrides,
            create_alert=False,
        )

    def run_full_audit(
        self,
        *,
        organization_id: uuid.UUID,
        location_id: uuid.UUID,
        trigger_source: str = "manual",
        overrides: dict[str, Any] | None = None,
        create_alert: bool = True,
    ) -> ListingAudit:
        location = assert_location_in_org(self.db, location_id=location_id, organization_id=organization_id)
        from backend.app.services.google_business.readiness import GbpReadinessService

        GbpReadinessService(self.db).calculate(
            organization_id=organization_id,
            location_id=location_id,
            persist=True,
        )
        previous = self.latest_audit(organization_id=organization_id, location_id=location_id)
        state = self._collect_state(location)
        state.update({key: value for key, value in (overrides or {}).items() if value is not None})

        audit = ListingAudit(
            organization_id=organization_id,
            location_id=location_id,
            category=state.get("primary_category"),
            audited_at=datetime.now(timezone.utc),
            photos_count=int(state.get("photos_count") or 0),
            hours_status="present" if state.get("hours") else "missing",
            trigger_source=trigger_source,
            status="running",
            previous_audit_id=previous.id if previous else None,
            metadata_json={"state_source": "stored_gbp_profile"},
        )
        self.db.add(audit)
        self.db.flush()

        items = self._build_items(audit=audit, state=state, previous=previous)
        for item in items:
            self.db.add(item)
        score = self._score(items)
        audit.profile_completeness_score = score
        audit.missing_services = self._missing_services(str(state.get("primary_category") or ""), state.get("services") or [])
        audit.missing_attributes = self._missing_attributes(str(state.get("primary_category") or ""), state.get("attributes") or [])
        audit.description_suggestions = [
            item.recommended_value for item in items if item.field_name == "business_description" and item.status != "complete"
        ]
        action_required = [item for item in items if item.user_action_required and item.status != "complete"]
        auto_fixable = [item for item in items if item.auto_fixable and item.status != "complete"]
        audit.summary_json = {
            "missing_fields": [item.field_name for item in items if item.status != "complete"],
            "action_required_count": len(action_required),
            "auto_fixable_count": len(auto_fixable),
            "complete_count": sum(1 for item in items if item.status == "complete"),
            "total_count": len(items),
            "popup": {
                "should_show": trigger_source != "manual" and (bool(action_required) or bool(auto_fixable)),
                "action_required": bool(action_required),
                "cta_path": "/dashboard/gbp-audit",
            },
        }
        audit.status = "completed"
        audit.completed_at = datetime.now(timezone.utc)
        self.db.add(audit)
        self.db.commit()
        self.db.refresh(audit)

        readiness = GbpReadinessService(self.db).after_audit_completed(
            organization_id=organization_id,
            location_id=location_id,
        )
        audit.summary_json = {**(audit.summary_json or {}), "readiness": readiness}
        self.db.add(audit)
        self.db.commit()
        self.db.refresh(audit)

        if create_alert:
            self._create_completion_alert(audit)
        self.audit_log.log(
            action="gbp.audit.completed",
            organization_id=organization_id,
            location_id=location_id,
            entity_type="listing_audit",
            entity_id=str(audit.id),
            metadata={"score": score, "trigger_source": trigger_source},
        )
        return audit

    def latest_audit(self, *, organization_id: uuid.UUID, location_id: uuid.UUID) -> ListingAudit | None:
        return (
            self.db.query(ListingAudit)
            .filter(ListingAudit.organization_id == organization_id, ListingAudit.location_id == location_id)
            .order_by(ListingAudit.audited_at.desc(), ListingAudit.created_at.desc())
            .first()
        )

    def history(self, *, organization_id: uuid.UUID, location_id: uuid.UUID, limit: int = 12) -> list[ListingAudit]:
        return (
            self.db.query(ListingAudit)
            .filter(ListingAudit.organization_id == organization_id, ListingAudit.location_id == location_id)
            .order_by(ListingAudit.audited_at.desc(), ListingAudit.created_at.desc())
            .limit(limit)
            .all()
        )

    def dashboard_payload(self, *, organization_id: uuid.UUID, location_id: uuid.UUID) -> dict[str, Any]:
        from backend.app.services.google_business.readiness import GbpReadinessService

        readiness = GbpReadinessService(self.db).calculate(
            organization_id=organization_id,
            location_id=location_id,
            persist=True,
        )
        latest = self.latest_audit(organization_id=organization_id, location_id=location_id)
        rows = self.history(organization_id=organization_id, location_id=location_id, limit=12)
        if not latest:
            return {"has_data": False, "latest": None, "items": [], "history": [], "readiness": readiness}
        items = sorted(latest.items, key=lambda item: (item.status == "complete", item.severity, item.field_name))
        return {
            "has_data": True,
            "latest": self._audit_dict(latest),
            "items": [self._item_dict(item) for item in items],
            "missing_fields": [self._item_dict(item) for item in items if item.status not in RESOLVED_ITEM_STATUSES],
            "auto_fixable_items": [self._item_dict(item) for item in items if item.auto_fixable and item.status not in RESOLVED_ITEM_STATUSES],
            "user_action_required_items": [
                self._item_dict(item) for item in items if item.user_action_required and item.status not in RESOLVED_ITEM_STATUSES
            ],
            "history": [self._audit_dict(row) for row in rows],
            "popup": (latest.summary_json or {}).get("popup", {}),
            "readiness": readiness,
        }

    def update_item_status(self, *, item_id: uuid.UUID, status: str, notes: str | None = None) -> ListingAuditItem:
        allowed = {"complete", "needs_review", "pending_approval", "auto_updated", "user_action_required", "dismissed"}
        if status not in allowed:
            raise ValueError("Unsupported audit item status")
        item = self.db.get(ListingAuditItem, item_id)
        if not item:
            raise ValueError("Audit item not found")
        item.status = status
        if status in {"complete", "dismissed", "auto_updated"}:
            item.resolved_at = datetime.now(timezone.utc)
        metadata = dict(item.metadata_json or {})
        if notes:
            metadata["status_notes"] = notes
        item.metadata_json = metadata
        self.db.add(item)
        self.db.commit()
        self.db.refresh(item)
        audit = self.db.get(ListingAudit, item.audit_id)
        if audit:
            self._refresh_audit_summary(audit)
            from backend.app.services.google_business.readiness import GbpReadinessService

            GbpReadinessService(self.db).after_audit_completed(
                organization_id=audit.organization_id,
                location_id=audit.location_id,
            )
            self.db.refresh(item)
        return item

    def apply_auto_fixes(self, *, audit_id: uuid.UUID) -> dict[str, Any]:
        audit = self.db.get(ListingAudit, audit_id)
        if not audit:
            raise ValueError("Audit not found")
        applied: list[str] = []
        for item in audit.items:
            if not item.auto_fixable or item.status in {"complete", "dismissed", "auto_updated", "pending_approval"}:
                continue
            if item.field_name in {"business_description", "service_descriptions"}:
                self._create_optimization_action(audit, item)
                item.status = "pending_approval"
                item.before_value = item.current_value
                item.after_value = item.recommended_value
                applied.append(item.field_name)
            elif item.field_name == "qna_section":
                self._create_qna_drafts(audit, item)
                item.status = "pending_approval"
                item.before_value = item.current_value
                item.after_value = item.recommended_value
                applied.append(item.field_name)
            item.auto_applied_at = datetime.now(timezone.utc)
            self.db.add(item)
        self.db.commit()
        self._refresh_audit_summary(audit)
        self.audit_log.log(
            action="gbp.audit.auto_fixes_prepared",
            organization_id=audit.organization_id,
            location_id=audit.location_id,
            entity_type="listing_audit",
            entity_id=str(audit.id),
            metadata={"fields": applied},
        )
        return {"audit_id": str(audit.id), "prepared": applied, "status": "pending_approval"}

    def generate_content(self, *, organization_id: uuid.UUID, location_id: uuid.UUID, content_type: str) -> dict[str, Any]:
        location = assert_location_in_org(self.db, location_id=location_id, organization_id=organization_id)
        state = self._collect_state(location)
        if content_type == "business_description":
            return {"content_type": content_type, "content": self._business_description(location, state)}
        if content_type == "service_descriptions":
            return {"content_type": content_type, "content": self._service_descriptions(location, state)}
        if content_type == "qna":
            return {"content_type": content_type, "content": self._qna_recommendations(location, state)}
        raise ValueError("Unsupported content_type")

    def schedule_monthly_audits(self) -> int:
        from backend.app.services.automation.actions import ActionService

        now = datetime.now(timezone.utc)
        _, days = monthrange(now.year, now.month)
        scheduled = 0
        action_service = ActionService(self.db)
        from backend.app.services.google_business.readiness import GbpReadinessService

        readiness = GbpReadinessService(self.db)
        locations = self.db.query(Location).filter(Location.status == LocationStatus.ACTIVE).all()
        for location in locations:
            state = readiness.calculate(
                organization_id=location.organization_id,
                location_id=location.id,
                persist=True,
            )
            if not state["gbp_connected"] or not state["subscription_active"]:
                continue
            latest = self.latest_audit(organization_id=location.organization_id, location_id=location.id)
            if latest and latest.audited_at.year == now.year and latest.audited_at.month == now.month:
                continue
            action_service.schedule_action(
                organization_id=location.organization_id,
                location_id=location.id,
                action_type=ActionType.RUN_GBP_AUDIT,
                run_at=now,
                payload={"location_id": str(location.id), "trigger_source": "monthly"},
                dedupe_key=f"gbp_audit:{location.id}:{now.year:04d}-{now.month:02d}",
            )
            scheduled += 1
        return scheduled

    def schedule_onboarding_audits(self) -> int:
        from backend.app.services.automation.actions import ActionService

        now = datetime.now(timezone.utc)
        scheduled = 0
        action_service = ActionService(self.db)
        from backend.app.services.google_business.readiness import GbpReadinessService

        readiness = GbpReadinessService(self.db)
        locations = self.db.query(Location).filter(Location.status == LocationStatus.ACTIVE).all()
        for location in locations:
            state = readiness.calculate(
                organization_id=location.organization_id,
                location_id=location.id,
                persist=True,
            )
            if not state["gbp_connected"] or not state["subscription_active"]:
                continue
            latest = self.latest_audit(organization_id=location.organization_id, location_id=location.id)
            if latest:
                continue
            action_service.schedule_action(
                organization_id=location.organization_id,
                location_id=location.id,
                action_type=ActionType.RUN_GBP_AUDIT,
                run_at=now,
                payload={"location_id": str(location.id), "trigger_source": "onboarding"},
                dedupe_key=f"gbp_audit:onboarding:{location.id}",
            )
            scheduled += 1
        return scheduled

    def auto_apply(self, audit: ListingAudit) -> dict:
        result = self.apply_auto_fixes(audit_id=audit.id)
        return {"services": audit.missing_services or [], "attributes": [], "pending": result["prepared"]}

    def _collect_state(self, location: Location) -> dict[str, Any]:
        settings = location.settings
        settings_json = dict(settings.settings_json or {}) if settings else {}
        address = dict(location.address or {})
        services = self._service_names(settings.services if settings else [])
        services.extend(self._service_names_from_gbp(address.get("serviceItems") or address.get("services") or []))
        services = list(dict.fromkeys([service for service in services if service]))
        service_descriptions = self._service_description_map(location, services, address=address)
        phone_numbers = address.get("phoneNumbers") if isinstance(address.get("phoneNumbers"), dict) else {}
        profile = address.get("profile") if isinstance(address.get("profile"), dict) else {}
        return {
            "primary_category": self._primary_category(address),
            "secondary_categories": self._secondary_categories(address),
            "services": services,
            "service_descriptions": service_descriptions,
            "business_description": settings_json.get("gbp_description")
            or profile.get("description")
            or ((settings.voice_profile or {}).get("business_description") if settings else None),
            "attributes": settings_json.get("attributes") or address.get("attributes") or [],
            "hours": settings_json.get("business_hours") or address.get("regularHours") or address.get("hours"),
            "phone": settings_json.get("phone")
            or settings_json.get("primary_phone")
            or phone_numbers.get("primaryPhone")
            or phone_numbers.get("additionalPhones")
            or address.get("primaryPhone")
            or address.get("phone"),
            "website_url": settings_json.get("website_url") or address.get("websiteUri") or address.get("website"),
            "address": address.get("addressLines")
            or address.get("locality")
            or address.get("city")
            or address.get("serviceArea"),
            "photos_count": self.db.query(MediaAsset).filter(MediaAsset.location_id == location.id).count(),
            "qna_count": self.db.query(QnaEntry).filter(QnaEntry.location_id == location.id, QnaEntry.status != QnaStatus.ARCHIVED).count(),
            "active_keywords": self._active_keywords(location.id),
        }

    def _build_items(self, *, audit: ListingAudit, state: dict[str, Any], previous: ListingAudit | None) -> list[ListingAuditItem]:
        previous_items = {item.field_name: item for item in previous.items} if previous else {}
        items: list[ListingAuditItem] = []

        def add(field: str, title: str, current: Any, recommended: Any, ok: bool, *, auto: bool = False, user: bool = False, severity: str = "medium", instructions: str = "", seo: str = "") -> None:
            status = "complete" if ok else ("user_action_required" if user else "needs_review")
            prev = previous_items.get(field)
            items.append(
                ListingAuditItem(
                    audit_id=audit.id,
                    organization_id=audit.organization_id,
                    location_id=audit.location_id,
                    field_name=field,
                    title=title,
                    current_value=current if current not in (None, "") else {},
                    recommended_value=recommended if recommended not in (None, "") else {},
                    severity="low" if ok else severity,
                    status=status,
                    auto_fixable=auto and not ok,
                    user_action_required=user and not ok,
                    instructions=instructions,
                    seo_reason=seo,
                    metadata_json={"previous_status": prev.status if prev else None},
                )
            )

        category = str(state.get("primary_category") or "")
        services = state.get("services") or []
        attrs = state.get("attributes") or []
        add("primary_category", "Primary category", category, "Select the most specific primary category.", bool(category), user=True, severity="critical", instructions="Confirm the main GBP category in Google Business Profile.", seo="Primary category is one of the strongest local relevance signals.")
        add("secondary_categories", "Secondary categories", state.get("secondary_categories"), "Add relevant secondary categories.", bool(state.get("secondary_categories")), user=True, instructions="Add only accurate secondary categories.", seo="Secondary categories expand eligible local searches.")
        add("services", "Services", services, self._missing_services(category, services), bool(services) and not self._missing_services(category, services), user=True, instructions="Add missing services manually or confirm service list.", seo="Services help Google match profile to service-intent searches.")
        add("service_descriptions", "Service descriptions", state.get("service_descriptions"), self._service_descriptions(audit.location, state), self._service_descriptions_complete(services, state.get("service_descriptions") or {}), auto=True, instructions="Review generated descriptions before publishing.", seo="Descriptions add controlled service relevance without changing sensitive profile data.")
        desc = state.get("business_description") or ""
        add("business_description", "Business description", desc, self._business_description(audit.location, state), len(desc) >= 250, auto=True, instructions="Review a light rewrite; do not replace stable core facts blindly.", seo="A complete description improves trust and service clarity.")
        add("attributes", "Attributes", attrs, self._missing_attributes(category, attrs), bool(attrs) and not self._missing_attributes(category, attrs), user=True, instructions="Confirm attributes in GBP; do not infer accessibility or amenity claims.", seo="Attributes improve profile completeness and filtered discovery.")
        add("hours", "Business hours", state.get("hours"), "Add regular hours and holiday hours.", bool(state.get("hours")), user=True, severity="critical", instructions="Confirm hours directly with the business.", seo="Hours affect visibility and conversion from local search.")
        add("phone", "Phone/contact info", state.get("phone"), "Add a primary phone number.", bool(state.get("phone")), user=True, severity="critical", instructions="Confirm phone/contact info with the business.", seo="Accurate contact data reduces friction and trust issues.")
        add("website_url", "Website URL", state.get("website_url"), "Add a live website URL.", bool(state.get("website_url")), user=True, instructions="Confirm the canonical website URL.", seo="Website URL supports trust, attribution, and conversion.")
        add("photos", "Photos", state.get("photos_count"), "Upload at least 5 current business photos.", int(state.get("photos_count") or 0) >= 5, user=True, instructions="Upload real business photos; avoid stock imagery.", seo="Fresh photos improve engagement and profile completeness.")
        add("qna_section", "Q&A section", {"count": state.get("qna_count")}, self._qna_recommendations(audit.location, state), int(state.get("qna_count") or 0) >= 3, auto=True, instructions="Review Q&A drafts before publishing.", seo="Q&A answers common buying questions and can cover service intent naturally.")
        return items

    def _refresh_audit_summary(self, audit: ListingAudit) -> None:
        items = list(audit.items)
        action_required = [item for item in items if item.user_action_required and item.status not in RESOLVED_ITEM_STATUSES]
        auto_fixable = [item for item in items if item.auto_fixable and item.status not in RESOLVED_ITEM_STATUSES]
        audit.profile_completeness_score = self._score(items)
        summary = dict(audit.summary_json or {})
        summary.update(
            {
                "missing_fields": [item.field_name for item in items if item.status not in RESOLVED_ITEM_STATUSES],
                "action_required_count": len(action_required),
                "auto_fixable_count": len(auto_fixable),
                "complete_count": sum(1 for item in items if item.status == "complete"),
                "total_count": len(items),
                "popup": {
                    "should_show": bool(action_required) or bool(auto_fixable),
                    "action_required": bool(action_required),
                    "cta_path": "/dashboard/gbp-audit",
                },
            }
        )
        audit.summary_json = summary
        self.db.add(audit)
        self.db.commit()

    def _create_completion_alert(self, audit: ListingAudit) -> None:
        action_required = int((audit.summary_json or {}).get("action_required_count") or 0)
        auto_fixable = int((audit.summary_json or {}).get("auto_fixable_count") or 0)
        if not action_required and not auto_fixable:
            return
        self.alerts.create_alert(
            severity=AlertSeverity.WARNING if action_required else AlertSeverity.INFO,
            alert_type="gbp_audit_complete",
            message=f"GBP audit complete. Score {audit.profile_completeness_score:.0f}. {action_required} user actions and {auto_fixable} reviewable updates.",
            organization_id=audit.organization_id,
            location_id=audit.location_id,
            metadata={"audit_id": str(audit.id), "cta_path": "/dashboard/gbp-audit", "action_required": action_required > 0},
        )

    def _create_optimization_action(self, audit: ListingAudit, item: ListingAuditItem) -> None:
        action = GbpOptimizationAction(
            organization_id=audit.organization_id,
            location_id=audit.location_id,
            campaign_cycle_id=None,
            action_type=f"gbp_audit_{item.field_name}",
            status="pending_review",
            auto_apply_allowed=False,
            before_value={"field": item.field_name, "value": item.current_value},
            after_value={"field": item.field_name, "value": item.recommended_value},
            source_keywords=self._active_keywords(audit.location_id)[:5],
            notes="Generated by GBP audit. Review required before updating Google Business Profile.",
        )
        self.db.add(action)

    def _create_qna_drafts(self, audit: ListingAudit, item: ListingAuditItem) -> None:
        for row in (item.recommended_value or [])[:3]:
            if not isinstance(row, dict):
                continue
            qna = QnaEntry(
                organization_id=audit.organization_id,
                location_id=audit.location_id,
                question=row.get("question") or "What services do you offer?",
                answer=row.get("answer") or "",
                status=QnaStatus.DRAFT,
                metadata_json={"source": "gbp_audit", "listing_audit_id": str(audit.id), "audit_item_id": str(item.id)},
            )
            self.db.add(qna)

    def _score(self, items: list[ListingAuditItem]) -> float:
        total = sum(FIELD_WEIGHTS.get(item.field_name, 5) for item in items)
        complete = sum(FIELD_WEIGHTS.get(item.field_name, 5) for item in items if item.status in RESOLVED_ITEM_STATUSES)
        return round((complete / total) * 100, 1) if total else 100.0

    def _business_description(self, location: Location, state: dict[str, Any]) -> str:
        city = self._city(location)
        services = ", ".join((state.get("services") or [])[:3]) or "local services"
        keywords = ", ".join((state.get("active_keywords") or [])[:3])
        tail = f" Services include {keywords}." if keywords else ""
        return f"{location.name} provides {services} for customers in {city}. The team focuses on clear scheduling, reliable communication, and practical local support.{tail}"[:750]

    def _service_descriptions(self, location: Location, state: dict[str, Any]) -> dict[str, str]:
        city = self._city(location)
        keywords = state.get("active_keywords") or []
        result: dict[str, str] = {}
        for service in state.get("services") or []:
            matching = next((kw for kw in keywords if set(kw.lower().split()) & set(str(service).lower().split())), service)
            result[str(service)] = f"{location.name} provides {service} in {city}. Customers can expect clear next steps, timely communication, and service guidance for {matching}."
        return result

    def _qna_recommendations(self, location: Location, state: dict[str, Any]) -> list[dict[str, str]]:
        city = self._city(location)
        services = (state.get("services") or ["service"])[:3]
        return [
            {
                "question": f"Do you offer {service} in {city}?",
                "answer": f"Yes. {location.name} can help with {service} in {city}. Contact the team for availability and next steps.",
            }
            for service in services
        ]

    def _service_descriptions_complete(self, services: list[str], descriptions: dict[str, str]) -> bool:
        if not services:
            return False
        return all(len(str(descriptions.get(service) or "")) >= 80 for service in services)

    def _service_description_map(self, location: Location, services: list[str], *, address: dict[str, Any] | None = None) -> dict[str, str]:
        result: dict[str, str] = {}
        for item in location.settings.services if location.settings and location.settings.services else []:
            if isinstance(item, dict):
                name = item.get("name") or item.get("service") or item.get("title")
                if name:
                    result[str(name)] = str(item.get("description") or "")
        for item in (address or {}).get("serviceItems") or []:
            name, description = self._gbp_service_name_description(item)
            if name:
                result[str(name)] = description or result.get(str(name), "")
        for row in self.db.query(BusinessService).filter(BusinessService.location_id == location.id, BusinessService.is_active == True).all():  # noqa: E712
            result[row.name] = row.description or result.get(row.name, "")
        for service in services:
            result.setdefault(service, "")
        return result

    def _service_names(self, values: Sequence[Any]) -> list[str]:
        result: list[str] = []
        for item in values or []:
            if isinstance(item, str) and item.strip():
                result.append(item.strip())
            elif isinstance(item, dict):
                name = item.get("name") or item.get("service") or item.get("title")
                if isinstance(name, str) and name.strip():
                    result.append(name.strip())
        return list(dict.fromkeys(result))

    def _service_names_from_gbp(self, values: Sequence[Any]) -> list[str]:
        result: list[str] = []
        for item in values or []:
            name, _description = self._gbp_service_name_description(item)
            if name:
                result.append(name)
        return list(dict.fromkeys(result))

    @staticmethod
    def _gbp_service_name_description(item: Any) -> tuple[str | None, str | None]:
        if not isinstance(item, dict):
            return (str(item).strip(), None) if str(item).strip() else (None, None)
        structured = item.get("structuredServiceItem") if isinstance(item.get("structuredServiceItem"), dict) else {}
        free_form = item.get("freeFormServiceItem") if isinstance(item.get("freeFormServiceItem"), dict) else {}
        label = free_form.get("label") if isinstance(free_form.get("label"), dict) else {}
        name = (
            item.get("name")
            or item.get("displayName")
            or structured.get("displayName")
            or structured.get("serviceTypeId")
            or label.get("displayName")
            or free_form.get("label")
        )
        description = item.get("description") or structured.get("description") or free_form.get("description")
        return (str(name).strip(), str(description).strip() if description else None) if name else (None, None)

    def _active_keywords(self, location_id: uuid.UUID) -> list[str]:
        return [
            row.keyword
            for row in self.db.query(SelectedKeyword)
            .filter(SelectedKeyword.location_id == location_id, SelectedKeyword.is_active == True)  # noqa: E712
            .order_by(SelectedKeyword.rank_order.asc())
            .limit(12)
            .all()
        ]

    def _missing_services(self, category: str, current: Sequence[str]) -> list[str]:
        templates = self.db.query(ServiceTemplate).filter(ServiceTemplate.category == category).all()
        current_set = {str(svc).lower() for svc in current}
        return [tpl.name for tpl in templates if tpl.name.lower() not in current_set]

    def _missing_attributes(self, category: str, current: Sequence[str]) -> list[str]:
        templates = self.db.query(AttributeTemplate).filter(AttributeTemplate.category == category).all()
        current_set = {str(attr).lower() for attr in current}
        return [tpl.attribute for tpl in templates if tpl.attribute.lower() not in current_set]

    @staticmethod
    def _primary_category(address: dict[str, Any]) -> str | None:
        categories = address.get("categories") if isinstance(address.get("categories"), dict) else {}
        value = address.get("primaryCategory") or categories.get("primaryCategory") or address.get("category")
        if isinstance(value, dict):
            return value.get("displayName") or value.get("name")
        return value if isinstance(value, str) else None

    @staticmethod
    def _secondary_categories(address: dict[str, Any]) -> list[str]:
        categories = address.get("categories") if isinstance(address.get("categories"), dict) else {}
        values = (
            address.get("secondaryCategories")
            or address.get("additionalCategories")
            or categories.get("additionalCategories")
            or []
        )
        if isinstance(values, dict):
            values = values.get("categories") or []
        result = []
        for item in values if isinstance(values, list) else []:
            result.append(item.get("displayName") if isinstance(item, dict) else str(item))
        return [item for item in result if item]

    @staticmethod
    def _city(location: Location) -> str:
        address = location.address or {}
        return str(address.get("city") or address.get("locality") or "the local area")

    @staticmethod
    def _audit_dict(audit: ListingAudit) -> dict[str, Any]:
        return {
            "id": str(audit.id),
            "audited_at": audit.audited_at.isoformat() if audit.audited_at else None,
            "completed_at": audit.completed_at.isoformat() if audit.completed_at else None,
            "profile_completeness_score": audit.profile_completeness_score,
            "status": audit.status,
            "trigger_source": audit.trigger_source,
            "summary": audit.summary_json or {},
        }

    @staticmethod
    def _item_dict(item: ListingAuditItem) -> dict[str, Any]:
        return {
            "id": str(item.id),
            "field_name": item.field_name,
            "title": item.title,
            "current_value": item.current_value,
            "recommended_value": item.recommended_value,
            "severity": item.severity,
            "status": item.status,
            "auto_fixable": item.auto_fixable,
            "user_action_required": item.user_action_required,
            "instructions": item.instructions,
            "seo_reason": item.seo_reason,
            "before_value": item.before_value,
            "after_value": item.after_value,
            "resolved_at": item.resolved_at.isoformat() if item.resolved_at else None,
            "auto_applied_at": item.auto_applied_at.isoformat() if item.auto_applied_at else None,
        }

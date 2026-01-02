from __future__ import annotations

from datetime import datetime, timezone
from typing import Sequence
import uuid

from sqlalchemy.orm import Session

from backend.app.models.attribute_template import AttributeTemplate
from backend.app.models.listing_audit import ListingAudit
from backend.app.models.pending_change import PendingChange
from backend.app.models.enums import PendingChangeStatus, PendingChangeType
from backend.app.models.service_template import ServiceTemplate


class ListingOptimizationService:
    def __init__(self, db: Session) -> None:
        self.db = db

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
        missing_services = self._missing_services(category, current_services)
        missing_attributes = self._missing_attributes(category, current_attributes)
        description_suggestions = []
        if len(description or "") < 250:
            description_suggestions.append("Enhance description with service + city keywords.")
        audit = ListingAudit(
            organization_id=organization_id,
            location_id=location_id,
            category=category,
            audited_at=datetime.now(timezone.utc),
            missing_services=missing_services,
            missing_attributes=missing_attributes,
            description_suggestions=description_suggestions,
            photos_count=photos_count,
            hours_status=hours_status,
        )
        self.db.add(audit)
        self.db.commit()
        self.db.refresh(audit)
        return audit

    def auto_apply(self, audit: ListingAudit) -> dict:
        applied = {"services": [], "attributes": [], "pending": []}
        for service in audit.missing_services or []:
            template = self._service_template(audit.category, service)
            if template and template.is_safe:
                applied["services"].append(service)
            else:
                change = self._create_pending_change(
                    audit, PendingChangeType.SERVICE, {"service": service}
                )
                applied["pending"].append(str(change.id))
        for attribute in audit.missing_attributes or []:
            template = self._attribute_template(audit.category, attribute)
            if template and template.is_safe:
                applied["attributes"].append(attribute)
            else:
                change = self._create_pending_change(
                    audit, PendingChangeType.ATTRIBUTE, {"attribute": attribute}
                )
                applied["pending"].append(str(change.id))
        for suggestion in audit.description_suggestions or []:
            change = self._create_pending_change(
                audit,
                PendingChangeType.DESCRIPTION,
                {"suggestion": suggestion},
                auto=False,
            )
            applied["pending"].append(str(change.id))
        return applied

    def _service_template(self, category: str, service: str) -> ServiceTemplate | None:
        return (
            self.db.query(ServiceTemplate)
            .filter(
                ServiceTemplate.category == category,
                ServiceTemplate.name == service,
            )
            .one_or_none()
        )

    def _attribute_template(self, category: str, attribute: str) -> AttributeTemplate | None:
        return (
            self.db.query(AttributeTemplate)
            .filter(
                AttributeTemplate.category == category,
                AttributeTemplate.attribute == attribute,
            )
            .one_or_none()
        )

    def _missing_services(self, category: str, current: Sequence[str]) -> list[str]:
        templates = (
            self.db.query(ServiceTemplate)
            .filter(ServiceTemplate.category == category)
            .all()
        )
        current_set = {svc.lower() for svc in current}
        return [tpl.name for tpl in templates if tpl.name.lower() not in current_set]

    def _missing_attributes(self, category: str, current: Sequence[str]) -> list[str]:
        templates = (
            self.db.query(AttributeTemplate)
            .filter(AttributeTemplate.category == category)
            .all()
        )
        current_set = {attr.lower() for attr in current}
        return [
            tpl.attribute
            for tpl in templates
            if tpl.attribute.lower() not in current_set
        ]

    def _create_pending_change(
        self,
        audit: ListingAudit,
        change_type: PendingChangeType,
        payload: dict,
        auto: bool = True,
    ) -> PendingChange:
        change = PendingChange(
            organization_id=audit.organization_id,
            location_id=audit.location_id,
            change_type=change_type,
            payload=payload,
            status=PendingChangeStatus.PENDING,
            notes=None if auto else "Requires approval",
        )
        self.db.add(change)
        self.db.commit()
        self.db.refresh(change)
        return change

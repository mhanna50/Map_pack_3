from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.orm import Session

from ..models.audit_log import AuditLog


class AuditService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def log(
        self,
        *,
        action: str,
        organization_id: uuid.UUID | None = None,
        actor_user_id: uuid.UUID | None = None,
        entity_type: str | None = None,
        entity_id: str | None = None,
        location_id: uuid.UUID | None = None,
        before: dict[str, Any] | None = None,
        after: dict[str, Any] | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> AuditLog:
        entry = AuditLog(
            action=action,
            organization_id=organization_id,
            location_id=location_id,
            actor_user_id=actor_user_id,
            entity_type=entity_type or "system",
            entity_id=entity_id,
            before_json=before or {},
            after_json=after or {},
            metadata_json=metadata or {},
        )
        self.db.add(entry)
        self.db.commit()
        self.db.refresh(entry)
        return entry


def log_audit(
    db: Session,
    *,
    action: str,
    actor: uuid.UUID | None = None,
    org_id: uuid.UUID | None = None,
    entity: str | None = None,
    entity_id: str | None = None,
    location_id: uuid.UUID | None = None,
    before: dict[str, Any] | None = None,
    after: dict[str, Any] | None = None,
    metadata: dict[str, Any] | None = None,
) -> AuditLog:
    service = AuditService(db)
    return service.log(
        action=action,
        organization_id=org_id,
        actor_user_id=actor,
        entity_type=entity,
        entity_id=entity_id,
        location_id=location_id,
        before=before,
        after=after,
        metadata=metadata,
    )

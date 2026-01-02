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
        event_type: str,
        organization_id: uuid.UUID | None = None,
        location_id: uuid.UUID | None = None,
        user_id: uuid.UUID | None = None,
        action_id: uuid.UUID | None = None,
        description: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> AuditLog:
        entry = AuditLog(
            event_type=event_type,
            organization_id=organization_id,
            location_id=location_id,
            user_id=user_id,
            action_id=action_id,
            description=description,
            metadata_json=metadata or {},
        )
        self.db.add(entry)
        self.db.commit()
        self.db.refresh(entry)
        return entry

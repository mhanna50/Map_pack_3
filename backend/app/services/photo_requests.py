from __future__ import annotations

from datetime import datetime, timedelta, timezone
import uuid

from sqlalchemy.orm import Session

from backend.app.models.enums import PhotoRequestStatus, PendingChangeStatus
from backend.app.models.media_upload_request import MediaUploadRequest
from backend.app.models.photo_request import PhotoRequest


class PhotoRequestService:
    """Creates and throttles photo requests when media is stale."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def request_if_stale(
        self,
        *,
        organization_id: uuid.UUID,
        location_id: uuid.UUID,
        reason: str,
        min_days_between_requests: int = 14,
    ) -> PhotoRequest | None:
        existing = (
            self.db.query(PhotoRequest)
            .filter(
                PhotoRequest.organization_id == organization_id,
                PhotoRequest.location_id == location_id,
            )
            .one_or_none()
        )
        now = datetime.now(timezone.utc)
        if existing and existing.next_allowed_at and existing.next_allowed_at > now:
            return None
        request = existing or PhotoRequest(
            organization_id=organization_id,
            location_id=location_id,
            reason=reason,
            status=PhotoRequestStatus.PENDING,
        )
        request.status = PhotoRequestStatus.REQUESTED
        request.last_requested_at = now
        request.next_allowed_at = now + timedelta(days=min_days_between_requests)
        self.db.add(request)
        self.db.commit()
        self.db.refresh(request)
        # also create media_upload_request to integrate with existing flows
        upload = MediaUploadRequest(
            organization_id=organization_id,
            location_id=location_id,
            reason=reason,
            status=PendingChangeStatus.PENDING,
            requested_at=now,
            due_by=now + timedelta(days=7),
            metadata_json={"photo_request_id": str(request.id)},
        )
        self.db.add(upload)
        self.db.commit()
        return request

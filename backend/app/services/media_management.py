from __future__ import annotations

from datetime import datetime, timedelta, timezone
import uuid
from typing import TYPE_CHECKING

from sqlalchemy.orm import Session

from backend.app.models.enums import ActionType, MediaStatus, MediaType, PendingChangeStatus
from backend.app.models.media_album import MediaAlbum
from backend.app.models.media_asset import MediaAsset
from backend.app.models.media_upload_request import MediaUploadRequest
from backend.app.services.media_selection import MediaSelector
from backend.app.services.validators import assert_location_in_org, assert_connected_account_in_org

if TYPE_CHECKING:
    from backend.app.services.actions import ActionService


class MediaManagementService:
    def __init__(self, db: Session, action_service: "ActionService" | None = None) -> None:
        self.db = db
        if action_service is None:
            from backend.app.services.actions import ActionService as ActionServiceImpl

            self.action_service = ActionServiceImpl(db)
        else:
            self.action_service = action_service

    def create_album(
        self,
        *,
        organization_id: uuid.UUID,
        location_id: uuid.UUID | None,
        name: str,
        description: str | None = None,
        tags: list[str] | None = None,
    ) -> MediaAlbum:
        if location_id:
            assert_location_in_org(self.db, location_id=location_id, organization_id=organization_id)
        album = MediaAlbum(
            organization_id=organization_id,
            location_id=location_id,
            name=name,
            description=description,
            tags=tags or [],
        )
        self.db.add(album)
        self.db.commit()
        self.db.refresh(album)
        return album

    def upload_media(
        self,
        *,
        organization_id: uuid.UUID,
        location_id: uuid.UUID | None,
        storage_url: str,
        file_name: str,
        media_type: MediaType,
        categories: list[str] | None = None,
        album_id: uuid.UUID | None = None,
        description: str | None = None,
        job_type: str | None = None,
        season: str | None = None,
        shot_stage: str | None = None,
        upload_request_id: uuid.UUID | None = None,
    ) -> MediaAsset:
        if location_id:
            assert_location_in_org(self.db, location_id=location_id, organization_id=organization_id)
        asset = MediaAsset(
            organization_id=organization_id,
            location_id=location_id,
            storage_url=storage_url,
            file_name=file_name,
            media_type=media_type,
            categories=categories or [],
            album_id=album_id,
            description=description,
            auto_caption=self._generate_caption(categories or [], description),
            status=MediaStatus.PENDING,
            job_type=job_type,
            season=season,
            shot_stage=shot_stage,
            upload_request_id=upload_request_id,
        )
        self.db.add(asset)
        self.db.commit()
        self.db.refresh(asset)
        if upload_request_id:
            self._attach_asset_to_request(asset, upload_request_id)
        return asset

    def approve_media(self, asset: MediaAsset, *, reviewer_id: uuid.UUID | None = None) -> MediaAsset:
        asset.status = MediaStatus.APPROVED
        metadata = dict(asset.metadata_json or {})
        if reviewer_id:
            approvals = metadata.get("approvals", [])
            approvals.append({"reviewer_id": str(reviewer_id), "approved_at": datetime.now(timezone.utc).isoformat()})
            metadata["approvals"] = approvals
        asset.metadata_json = metadata
        if asset.upload_request_id:
            request = self.db.get(MediaUploadRequest, asset.upload_request_id)
            if request:
                request.status = PendingChangeStatus.APPROVED
                req_metadata = dict(request.metadata_json or {})
                req_metadata["approved_asset_id"] = str(asset.id)
                request.metadata_json = req_metadata
                self.db.add(request)
        self.db.add(asset)
        self.db.commit()
        self.db.refresh(asset)
        return asset

    def request_upload_if_stale(
        self,
        *,
        organization_id: uuid.UUID,
        location_id: uuid.UUID,
        days_without_upload: int = 14,
    ) -> MediaUploadRequest | None:
        assert_location_in_org(self.db, location_id=location_id, organization_id=organization_id)
        existing_pending = (
            self.db.query(MediaUploadRequest)
            .filter(MediaUploadRequest.location_id == location_id)
            .filter(MediaUploadRequest.status == PendingChangeStatus.PENDING)
            .order_by(MediaUploadRequest.requested_at.desc())
            .first()
        )
        if existing_pending:
            return existing_pending

        latest = (
            self.db.query(MediaAsset)
            .filter(MediaAsset.location_id == location_id)
            .order_by(MediaAsset.created_at.desc())
            .first()
        )
        cutoff = datetime.now(timezone.utc) - timedelta(days=days_without_upload)
        latest_created_at = latest.created_at if latest else None
        if latest_created_at and latest_created_at.tzinfo is None:
            latest_created_at = latest_created_at.replace(tzinfo=timezone.utc)
        if latest and latest_created_at and latest_created_at >= cutoff:
            return None
        request = MediaUploadRequest(
            organization_id=organization_id,
            location_id=location_id,
            reason="No new photos uploaded recently",
            status=PendingChangeStatus.PENDING,
            requested_at=datetime.now(timezone.utc),
            due_by=datetime.now(timezone.utc) + timedelta(days=7),
        )
        self.db.add(request)
        self.db.commit()
        self.db.refresh(request)
        self.action_service.schedule_action(
            organization_id=organization_id,
            action_type=ActionType.REQUEST_MEDIA_UPLOAD,
            run_at=request.requested_at,
            payload={"media_upload_request_id": str(request.id)},
            location_id=location_id,
        )
        return request

    def mark_request_notified(self, request: MediaUploadRequest) -> MediaUploadRequest:
        request.notified_at = datetime.now(timezone.utc)
        metadata = dict(request.metadata_json or {})
        metadata["last_notification"] = request.notified_at.isoformat()
        request.metadata_json = metadata
        self.db.add(request)
        self.db.commit()
        self.db.refresh(request)
        return request

    def next_media_for_posting(
        self, *, location_id: uuid.UUID, theme: str | None = None
    ) -> MediaAsset | None:
        selector = MediaSelector(self.db)
        return selector.pick_asset(location_id=location_id, theme=theme)

    def list_assets(
        self,
        *,
        organization_id: uuid.UUID | None = None,
        location_id: uuid.UUID | None = None,
        status: MediaStatus | None = None,
        album_id: uuid.UUID | None = None,
    ) -> list[MediaAsset]:
        query = self.db.query(MediaAsset)
        if organization_id:
            query = query.filter(MediaAsset.organization_id == organization_id)
        if location_id:
            query = query.filter(MediaAsset.location_id == location_id)
        if status:
            query = query.filter(MediaAsset.status == status)
        if album_id:
            query = query.filter(MediaAsset.album_id == album_id)
        return list(query.order_by(MediaAsset.created_at.desc()).all())

    def list_upload_requests(
        self,
        *,
        organization_id: uuid.UUID | None = None,
        location_id: uuid.UUID | None = None,
        status: PendingChangeStatus | None = None,
    ) -> list[MediaUploadRequest]:
        query = self.db.query(MediaUploadRequest)
        if organization_id:
            query = query.filter(MediaUploadRequest.organization_id == organization_id)
        if location_id:
            query = query.filter(MediaUploadRequest.location_id == location_id)
        if status:
            query = query.filter(MediaUploadRequest.status == status)
        return list(query.order_by(MediaUploadRequest.requested_at.desc()).all())

    @staticmethod
    def _generate_caption(categories: list[str], description: str | None) -> str:
        if description:
            return description[:512]
        if not categories:
            return "Fresh upload ready for review."
        return f"New {categories[0]} photo ready to share."

    def _attach_asset_to_request(self, asset: MediaAsset, request_id: uuid.UUID) -> None:
        request = self.db.get(MediaUploadRequest, request_id)
        if not request:
            return
        metadata = dict(request.metadata_json or {})
        uploads = metadata.get("asset_ids", [])
        uploads.append(str(asset.id))
        metadata["asset_ids"] = uploads
        request.metadata_json = metadata
        self.db.add(request)
        self.db.commit()
        self.db.refresh(request)

from __future__ import annotations

import uuid

from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from ..db.session import get_db
from ..models.enums import MediaStatus, MediaType, PendingChangeStatus
from ..models.media_album import MediaAlbum
from ..models.media_asset import MediaAsset
from ..models.media_upload_request import MediaUploadRequest
from ..services.media_management import MediaManagementService

router = APIRouter(prefix="/media", tags=["media"])


class AlbumResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    description: str | None = None
    tags: list[str] | None = None


class AlbumCreateRequest(BaseModel):
    organization_id: uuid.UUID
    location_id: uuid.UUID | None = None
    name: str
    description: str | None = None
    tags: list[str] | None = None


@router.post("/albums", response_model=AlbumResponse, status_code=status.HTTP_201_CREATED)
def create_album(payload: AlbumCreateRequest, db: Session = Depends(get_db)) -> MediaAlbum:
    service = MediaManagementService(db)
    return service.create_album(
        organization_id=payload.organization_id,
        location_id=payload.location_id,
        name=payload.name,
        description=payload.description,
        tags=payload.tags,
    )


class MediaUploadRequestModel(BaseModel):
    organization_id: uuid.UUID
    location_id: uuid.UUID | None
    storage_url: str
    file_name: str
    media_type: MediaType
    categories: list[str] | None = None
    album_id: uuid.UUID | None = None
    description: str | None = None
    job_type: str | None = None
    season: str | None = None
    shot_stage: str | None = None
    upload_request_id: uuid.UUID | None = None


class MediaAssetResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    location_id: uuid.UUID | None
    album_id: uuid.UUID | None = None
    upload_request_id: uuid.UUID | None = None
    file_name: str
    storage_url: str
    media_type: str
    status: str
    categories: list[str] | None = None
    job_type: str | None = None
    season: str | None = None
    shot_stage: str | None = None
    auto_caption: str | None = None


@router.post("/assets", response_model=MediaAssetResponse, status_code=status.HTTP_201_CREATED)
def upload_media(payload: MediaUploadRequestModel, db: Session = Depends(get_db)) -> MediaAsset:
    service = MediaManagementService(db)
    asset = service.upload_media(
        organization_id=payload.organization_id,
        location_id=payload.location_id,
        storage_url=payload.storage_url,
        file_name=payload.file_name,
        media_type=payload.media_type,
        categories=payload.categories,
        album_id=payload.album_id,
        description=payload.description,
        job_type=payload.job_type,
        season=payload.season,
        shot_stage=payload.shot_stage,
        upload_request_id=payload.upload_request_id,
    )
    return asset


class MediaRequestResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    reason: str
    status: str
    requested_at: datetime
    due_by: datetime | None = None
    notified_at: datetime | None = None


class MediaRequestTriggerPayload(BaseModel):
    organization_id: uuid.UUID
    location_id: uuid.UUID
    days_without_upload: int = 14


class MediaRequestTriggerResponse(BaseModel):
    created: bool
    request: MediaRequestResponse | None = None


@router.post("/requests", response_model=MediaRequestTriggerResponse, status_code=status.HTTP_201_CREATED)
def create_media_request(
    payload: MediaRequestTriggerPayload,
    db: Session = Depends(get_db),
) -> MediaRequestTriggerResponse:
    service = MediaManagementService(db)
    request = service.request_upload_if_stale(
        organization_id=payload.organization_id,
        location_id=payload.location_id,
        days_without_upload=payload.days_without_upload,
    )
    return {"created": request is not None, "request": request}


@router.get("/requests", response_model=list[MediaRequestResponse])
def list_media_requests(
    organization_id: uuid.UUID | None = None,
    location_id: uuid.UUID | None = None,
    status: PendingChangeStatus | None = Query(None),
    db: Session = Depends(get_db),
) -> list[MediaUploadRequest]:
    service = MediaManagementService(db)
    return service.list_upload_requests(
        organization_id=organization_id,
        location_id=location_id,
        status=status,
    )


class MediaAssetApprovalRequest(BaseModel):
    reviewer_id: uuid.UUID | None = None


@router.post("/assets/{asset_id}/approve", response_model=MediaAssetResponse)
def approve_media_asset(
    asset_id: uuid.UUID,
    payload: MediaAssetApprovalRequest | None = None,
    db: Session = Depends(get_db),
) -> MediaAsset:
    asset = db.get(MediaAsset, asset_id)
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")
    service = MediaManagementService(db)
    return service.approve_media(asset, reviewer_id=payload.reviewer_id if payload else None)


@router.get("/assets", response_model=list[MediaAssetResponse])
def list_media_assets(
    organization_id: uuid.UUID | None = None,
    location_id: uuid.UUID | None = None,
    status: MediaStatus | None = Query(None),
    album_id: uuid.UUID | None = None,
    db: Session = Depends(get_db),
) -> list[MediaAsset]:
    service = MediaManagementService(db)
    return service.list_assets(
        organization_id=organization_id,
        location_id=location_id,
        status=status,
        album_id=album_id,
    )

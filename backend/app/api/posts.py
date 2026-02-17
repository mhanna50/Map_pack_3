from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, ConfigDict
from sqlalchemy.orm import Session

from backend.app.api.deps import get_current_user, require_org_member
from ..db.session import get_db
from ..models.enums import PostStatus, PostType
from ..models.media_asset import MediaAsset
from ..models.post import Post
from ..services.posts import PostService
from ..services.access import AccessService

router = APIRouter(
    prefix="/posts",
    tags=["posts"],
    dependencies=[Depends(get_current_user), Depends(require_org_member)],
)


class PostVariantResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    body: str
    compliance_flags: dict | None = None


class PostResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    location_id: uuid.UUID
    post_type: PostType
    status: PostStatus
    scheduled_at: datetime | None = None
    published_at: datetime | None = None
    body: str
    ai_prompt_context: dict | None = None
    rotation_context: dict | None = None
    variants: list[PostVariantResponse] = []


class PostCreateRequest(BaseModel):
    organization_id: uuid.UUID
    location_id: uuid.UUID
    connected_account_id: uuid.UUID | None = None
    post_type: PostType = PostType.UPDATE
    base_prompt: str
    scheduled_at: datetime | None = None
    context: dict | None = Field(default_factory=dict)
    brand_voice: dict | None = None
    services: list[str] | None = None
    keywords: list[str] | None = None
    cities: list[str] | None = None
    variants: int = 3


@router.post("/", response_model=PostResponse, status_code=status.HTTP_201_CREATED)
def create_post(
    payload: PostCreateRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> Post:
    access = AccessService(db)
    try:
        access.resolve_org(user_id=current_user.id, organization_id=payload.organization_id)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    service = PostService(db)
    try:
        service.validate_scope(
            organization_id=payload.organization_id,
            location_id=payload.location_id,
            connected_account_id=payload.connected_account_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    rotation = service.select_rotation_values(
        organization_id=payload.organization_id,
        location_id=payload.location_id,
        services=payload.services or [],
        keywords=payload.keywords or [],
        cities=payload.cities or [],
    )
    context = payload.context or {}
    context["rotation"] = rotation
    post = service.create_post(
        organization_id=payload.organization_id,
        location_id=payload.location_id,
        connected_account_id=payload.connected_account_id,
        post_type=payload.post_type,
        base_prompt=payload.base_prompt,
        scheduled_at=payload.scheduled_at,
        context=context,
        brand_voice=payload.brand_voice,
        services=payload.services or [],
        keywords=payload.keywords or [],
        locations=payload.cities or [],
        variants=payload.variants,
    )
    post.rotation_context = rotation
    db.add(post)
    db.commit()
    db.refresh(post)
    return post


@router.get("/", response_model=list[PostResponse])
def list_posts(
    organization_id: uuid.UUID | None = None,
    location_id: uuid.UUID | None = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> list[Post]:
    # Membership already enforced by require_org_member when org_id/location_id present
    query = db.query(Post).order_by(Post.scheduled_at.desc().nullslast())
    if organization_id:
        query = query.filter(Post.organization_id == organization_id)
    if location_id:
        query = query.filter(Post.location_id == location_id)
    return query.limit(100).all()


class PostStatusUpdateRequest(BaseModel):
    status: PostStatus


@router.put("/{post_id}/status", response_model=PostResponse)
def update_post_status(
    post_id: uuid.UUID,
    payload: PostStatusUpdateRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> Post:
    post = db.get(Post, post_id)
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    AccessService(db).resolve_org(user_id=current_user.id, organization_id=post.organization_id)
    service = PostService(db)
    service.validate_scope(
        organization_id=post.organization_id,
        location_id=post.location_id,
        connected_account_id=post.connected_account_id,
    )
    return service.update_post_status(post, payload.status)


class MediaAttachmentRequest(BaseModel):
    media_asset_id: uuid.UUID


@router.post("/{post_id}/attachments", response_model=PostResponse)
def attach_media(
    post_id: uuid.UUID,
    payload: MediaAttachmentRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> Post:
    post = db.get(Post, post_id)
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    AccessService(db).resolve_org(user_id=current_user.id, organization_id=post.organization_id)
    asset = db.get(MediaAsset, payload.media_asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Media asset not found")
    service = PostService(db)
    service.validate_scope(
        organization_id=post.organization_id,
        location_id=post.location_id,
        connected_account_id=post.connected_account_id,
    )
    service.attach_media(post, asset)
    db.refresh(post)
    return post

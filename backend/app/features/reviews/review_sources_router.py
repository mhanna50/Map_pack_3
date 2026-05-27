from __future__ import annotations

from datetime import datetime
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from backend.app.api.deps import get_current_user, require_org_member
from backend.app.db.session import get_db
from backend.app.models.enums import ReviewProvider, ReviewRating, ReviewStatus
from backend.app.models.reviews.review import Review
from backend.app.services.auth.access import AccessService
from backend.app.features.reviews.providers import ReviewProviderRegistry, TOP_REVIEW_PROVIDERS

router = APIRouter(
    prefix="/reviews",
    tags=["reviews"],
    dependencies=[Depends(get_current_user), Depends(require_org_member)],
)


class ProviderStatusResponse(BaseModel):
    provider: ReviewProvider
    display_name: str
    supports_sync: bool
    supports_reply: bool
    requirements: list[str]
    configured: bool
    mapped_reviews: int
    notes: str | None = None


class ReviewResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    location_id: uuid.UUID
    provider: ReviewProvider
    external_review_id: str
    source_url: str | None = None
    author_name: str | None = None
    rating: ReviewRating
    comment: str
    reply_comment: str | None = None
    reply_submitted_at: str | None = None
    status: ReviewStatus
    created_at: datetime | None = None
    updated_at: datetime | None = None


class SyncProviderResult(BaseModel):
    provider: ReviewProvider
    status: str
    count: int = 0
    message: str | None = None


class ReplyRequest(BaseModel):
    body: str = Field(..., min_length=1, max_length=4096)


@router.get("/providers", response_model=list[ProviderStatusResponse])
def list_review_providers(
    organization_id: uuid.UUID = Query(...),
    location_id: uuid.UUID | None = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> list[dict]:
    _require_org_access(db, current_user.id, organization_id)
    return ReviewProviderRegistry(db).status(organization_id=organization_id, location_id=location_id)


@router.get("/", response_model=list[ReviewResponse])
def list_reviews(
    organization_id: uuid.UUID = Query(...),
    location_id: uuid.UUID | None = Query(None),
    provider: ReviewProvider | None = Query(None),
    status_filter: ReviewStatus | None = Query(None, alias="status"),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> list[Review]:
    _require_org_access(db, current_user.id, organization_id)
    query = db.query(Review).filter(Review.organization_id == organization_id)
    if location_id:
        query = query.filter(Review.location_id == location_id)
    if provider:
        query = query.filter(Review.provider == provider)
    if status_filter:
        query = query.filter(Review.status == status_filter)
    return query.order_by(Review.created_at.desc()).limit(limit).all()


@router.post("/sync", response_model=list[SyncProviderResult], status_code=status.HTTP_202_ACCEPTED)
def sync_reviews(
    organization_id: uuid.UUID,
    location_id: uuid.UUID,
    provider: ReviewProvider | None = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> list[SyncProviderResult]:
    _require_org_access(db, current_user.id, organization_id)
    registry = ReviewProviderRegistry(db)
    providers = [provider] if provider else list(TOP_REVIEW_PROVIDERS)
    results = [
        registry.adapter(item).sync_reviews(
            organization_id=organization_id,
            location_id=location_id,
        )
        for item in providers
    ]
    return [
        SyncProviderResult(
            provider=result.provider,
            status=result.status,
            count=result.count,
            message=result.message,
        )
        for result in results
    ]


@router.post("/{review_id}/reply", response_model=ReviewResponse)
def reply_to_review(
    review_id: uuid.UUID,
    payload: ReplyRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> Review:
    review = db.get(Review, review_id)
    if not review:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Review not found")
    _require_org_access(db, current_user.id, review.organization_id)
    try:
        ReviewProviderRegistry(db).adapter(review.provider).reply_to_review(review, payload.body)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    db.refresh(review)
    review.status = ReviewStatus.REPLIED
    db.add(review)
    db.commit()
    db.refresh(review)
    return review


def _require_org_access(db: Session, user_id: uuid.UUID, organization_id: uuid.UUID) -> None:
    try:
        AccessService(db).resolve_org(user_id=user_id, organization_id=organization_id)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc

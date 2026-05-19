from __future__ import annotations

import re
import uuid
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from sqlalchemy.orm import Session

from backend.app.api.deps import get_current_user, require_org_member
from backend.app.db.session import get_db
from backend.app.models.enums import ReviewRequestStatus
from backend.app.models.reviews.review_request import ReviewRequest
from backend.app.services.auth.access import AccessDeniedError, AccessService
from backend.app.services.reviews.review_requests import ReviewRequestService

router = APIRouter(
    prefix="/review-requests",
    tags=["review_requests"],
    dependencies=[Depends(get_current_user), Depends(require_org_member)],
)


class ReviewRequestCreate(BaseModel):
    organization_id: uuid.UUID
    location_id: uuid.UUID | None = None
    customer_name: str = Field(..., min_length=1, max_length=255)
    customer_phone: str = Field(..., min_length=8, max_length=32)
    customer_email: EmailStr | None = None
    channel: Literal["sms"] = "sms"
    notes: str | None = Field(default=None, max_length=1000)
    send_at: datetime | None = None


class ReviewRequestResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    location_id: uuid.UUID | None = None
    contact_id: uuid.UUID
    job_id: uuid.UUID | None = None
    channel: str
    status: ReviewRequestStatus
    created_at: datetime | None = None
    sent_at: datetime | None = None
    completed_at: datetime | None = None
    customer_name: str | None = None
    customer_phone: str | None = None
    customer_email: str | None = None


@router.post("/", response_model=ReviewRequestResponse, status_code=status.HTTP_201_CREATED)
def create_review_request(
    payload: ReviewRequestCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> ReviewRequestResponse:
    access = AccessService(db)
    try:
        access.resolve_org(user_id=current_user.id, organization_id=payload.organization_id)
    except AccessDeniedError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc

    phone = _normalize_phone(payload.customer_phone)
    if not phone:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Phone must be in E.164 format, for example +15551234567")

    service = ReviewRequestService(db)
    contact = service.create_contact(
        organization_id=payload.organization_id,
        location_id=payload.location_id,
        name=payload.customer_name.strip(),
        phone=phone,
        email=str(payload.customer_email) if payload.customer_email else None,
    )
    job = service.create_job(
        organization_id=payload.organization_id,
        location_id=payload.location_id,
        contact_id=contact.id,
        payload={"notes": payload.notes} if payload.notes else None,
    )
    review_request = service.queue_review_request(
        organization_id=payload.organization_id,
        location_id=payload.location_id,
        contact_id=contact.id,
        job_id=job.id,
        channel=payload.channel,
        send_at=payload.send_at,
    )
    db.refresh(review_request)
    return _response(review_request)


def _normalize_phone(raw: str) -> str | None:
    phone = re.sub(r"[\s().-]+", "", raw.strip())
    if re.fullmatch(r"\+[1-9]\d{7,14}", phone):
        return phone
    return None


def _response(review_request: ReviewRequest) -> ReviewRequestResponse:
    contact = review_request.contact
    return ReviewRequestResponse(
        id=review_request.id,
        organization_id=review_request.organization_id,
        location_id=review_request.location_id,
        contact_id=review_request.contact_id,
        job_id=review_request.job_id,
        channel=review_request.channel,
        status=review_request.status,
        created_at=review_request.created_at,
        sent_at=review_request.sent_at,
        completed_at=review_request.completed_at,
        customer_name=contact.name if contact else None,
        customer_phone=contact.phone if contact else None,
        customer_email=contact.email if contact else None,
    )

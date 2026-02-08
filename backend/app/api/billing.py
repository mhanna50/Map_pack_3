from __future__ import annotations

import json
import logging

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from backend.app.db.session import get_db
from backend.app.api.deps import get_current_staff
from backend.app.services.billing import BillingService
from backend.app.services.provisioning import ClientProvisioningService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/billing", tags=["billing"])


class CheckoutRequest(BaseModel):
    email: EmailStr
    company_name: str = Field(..., min_length=2)
    plan: str = Field(default="starter", examples=["starter", "pro"])


class CheckoutResponse(BaseModel):
    checkout_url: str
    session_id: str


class CheckoutLinkRequest(BaseModel):
    email: EmailStr
    company_name: str = Field(..., min_length=2)
    plan: str = Field(default="starter", examples=["starter", "pro"])


class CheckoutLinkResponse(BaseModel):
    checkout_url: str
    session_id: str
    emailed: bool


@router.post("/checkout", response_model=CheckoutResponse)
def create_checkout_session(payload: CheckoutRequest) -> CheckoutResponse:
    service = BillingService()
    try:
        session = service.create_checkout_session(
            email=payload.email,
            company_name=payload.company_name,
            plan=payload.plan,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    if not session.url:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Stripe session missing URL")
    return CheckoutResponse(checkout_url=session.url, session_id=session.id)


@router.post("/checkout-link", response_model=CheckoutLinkResponse)
def send_checkout_link(
    payload: CheckoutLinkRequest,
    _: object = Depends(get_current_staff),
) -> CheckoutLinkResponse:
    service = BillingService()
    try:
        session = service.create_checkout_session(
            email=payload.email,
            company_name=payload.company_name,
            plan=payload.plan,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    if not session.url:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Stripe session missing URL")
    emailed = False
    return CheckoutLinkResponse(checkout_url=session.url, session_id=session.id, emailed=emailed)


@router.post("/webhook")
async def stripe_webhook(
    request: Request,
    db: Session = Depends(get_db),
    stripe_signature: str | None = Header(default=None, alias="stripe-signature"),
) -> dict[str, bool]:
    body = await request.body()
    billing = BillingService()
    try:
        event = billing.verify_webhook(body, stripe_signature)
    except ValueError as exc:
        logger.error("Stripe webhook verification failed: %s", exc)
        raise HTTPException(status_code=400, detail="Invalid webhook signature") from exc
    event_type = event["type"]
    logger.info("Stripe webhook received: %s", event_type)
    if event_type == "checkout.session.completed":
        session_data = event["data"]["object"]
        checkout_data = billing.extract_checkout_data(session_data)
        email = checkout_data.get("email")
        if not email:
            logger.warning("Stripe session missing customer email: %s", json.dumps(session_data))
            return {"received": True}
        provisioner = ClientProvisioningService(db)
        provisioner.provision_paid_customer(
            email=email,
            company_name=checkout_data["company_name"],
            plan=checkout_data["plan"],
            checkout_reference=checkout_data["reference"],
        )
    return {"received": True}

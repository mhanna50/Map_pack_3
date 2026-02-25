from __future__ import annotations

import json
import logging

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.exc import DataError, IntegrityError
from sqlalchemy.orm import Session

from backend.app.db.session import get_db
from backend.app.api.deps import get_current_staff
from backend.app.services.billing import BillingService
from backend.app.services.provisioning import ClientProvisioningService
from backend.app.models.organization import Organization
from backend.app.models.membership import Membership
from backend.app.models.user import User
from backend.app.models.billing_subscription import BillingSubscription
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/billing", tags=["billing"])

CANONICAL_BILLING_STATUSES = {"active", "trialing", "past_due", "canceled"}
STRIPE_TO_CANONICAL_BILLING_STATUS = {
    "active": "active",
    "trialing": "trialing",
    "past_due": "past_due",
    "canceled": "canceled",
    "cancelled": "canceled",
    # Stripe transient/terminal statuses that should not keep the account active.
    "incomplete": "canceled",
    "incomplete_expired": "canceled",
    "unpaid": "canceled",
    "paused": "canceled",
}


def _normalize_billing_status(raw_status: str | None) -> str | None:
    normalized = str(raw_status or "").strip().lower()
    if not normalized:
        return None
    mapped = STRIPE_TO_CANONICAL_BILLING_STATUS.get(normalized)
    if mapped:
        return mapped
    if normalized in CANONICAL_BILLING_STATUSES:
        return normalized
    return "canceled"


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


class SubscriptionRequest(BaseModel):
    email: EmailStr
    company_name: str = Field(..., min_length=2)
    plan: str = Field(default="starter", examples=["starter", "pro"])


class SubscriptionResponse(BaseModel):
    client_secret: str | None = None
    subscription_id: str
    requires_payment_method: bool = True


class WebhookSubscriptionUpdate(BaseModel):
    subscription_id: str
    status: str
    current_period_end: int | None = None


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


@router.post("/subscribe", response_model=SubscriptionResponse)
def create_subscription(payload: SubscriptionRequest) -> SubscriptionResponse:
    service = BillingService()
    try:
        result = service.create_subscription_intent(
            email=payload.email,
            company_name=payload.company_name,
            plan=payload.plan,
        )
    except ValueError as exc:
        logger.warning("Stripe subscribe failed for %s (%s): %s", payload.email, payload.plan, exc)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return SubscriptionResponse(**result)


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
    elif event_type == "customer.subscription.created":
        obj = event["data"]["object"]
        subscription_id = obj.get("id")
        status = obj.get("status")
        current_period_end = obj.get("current_period_end")
        cancel_at_period_end = obj.get("cancel_at_period_end")
        if subscription_id:
            _update_org_status(
                db,
                billing,
                subscription_id,
                status,
                current_period_end,
                cancel_at_period_end,
                force_active=True,
            )
    elif event_type in {
        "invoice.paid",
        "invoice.payment_failed",
        "customer.subscription.updated",
        "customer.subscription.deleted",
        "customer.subscription.paused",
        "customer.subscription.resumed",
        "customer.subscription.canceled",
    }:
        obj = event["data"]["object"]
        if event_type.startswith("invoice."):
            # Invoice events carry `subscription`; `id` is the invoice id and cannot be retrieved as a subscription.
            subscription_id = obj.get("subscription")
        else:
            subscription_id = obj.get("id")
        status = obj.get("status")
        current_period_end = obj.get("current_period_end")
        cancel_at_period_end = obj.get("cancel_at_period_end")
        if subscription_id:
            _update_org_status(db, billing, subscription_id, status, current_period_end, cancel_at_period_end)
    return {"received": True}


def _update_org_status(
    db: Session,
    billing: BillingService,
    subscription_id: str,
    status: str | None,
    current_period_end: int | None,
    cancel_at_period_end: bool | None,
    *,
    force_active: bool = False,
) -> None:
    try:
        subscription = billing.get_subscription(subscription_id)
    except Exception as exc:  # noqa: BLE001
        logger.error("Failed to fetch subscription %s: %s", subscription_id, exc)
        return

    email = None
    customer = subscription.get("customer")
    if isinstance(customer, dict):
        email = customer.get("email")
    email = email or subscription.get("customer_email")
    if not email:
        logger.warning("Subscription %s missing customer email", subscription_id)
        return

    # Find user and their org membership
    user = db.query(User).filter(User.email == email).one_or_none()
    if not user:
        logger.warning("No user found for subscription email %s", email)
        return
    membership = db.query(Membership).filter(Membership.user_id == user.id).order_by(Membership.created_at.asc()).first()
    if not membership:
        logger.warning("No membership found for subscription email %s", email)
        return

    org = db.get(Organization, membership.organization_id)
    if not org:
        logger.warning("Organization not found for subscription email %s", email)
        return

    # Prefer canonical values from Stripe subscription object over event payload fields.
    stripe_subscription_status = str(subscription.get("status") or status or "").lower()
    subscription_status = _normalize_billing_status(stripe_subscription_status)
    if isinstance(subscription.get("current_period_end"), int):
        current_period_end = subscription.get("current_period_end")
    if isinstance(subscription.get("cancel_at_period_end"), bool):
        cancel_at_period_end = subscription.get("cancel_at_period_end")

    # Active when subscription is active/trialing; inactive otherwise
    active_statuses = {"active", "trialing"}
    org_active = force_active or subscription_status in active_statuses
    metadata = org.metadata_json or {}
    metadata["subscription_id"] = subscription_id
    if stripe_subscription_status:
        metadata["stripe_subscription_status"] = stripe_subscription_status
    if subscription_status:
        metadata["normalized_subscription_status"] = subscription_status
    if current_period_end:
        metadata["current_period_end"] = current_period_end
    if cancel_at_period_end is not None:
        metadata["cancel_at_period_end"] = cancel_at_period_end
    org.metadata_json = metadata
    org.posting_paused = not org_active
    org.is_active = org_active
    db.add(org)

    # Upsert billing_subscriptions record for tracking.
    # We keep one row per org (tenant_id is unique in production schema).
    sub = db.query(BillingSubscription).filter_by(tenant_id=org.id).one_or_none()
    if not sub:
        sub = db.query(BillingSubscription).filter_by(stripe_subscription_id=subscription_id).one_or_none()
    if not sub:
        sub = BillingSubscription(tenant_id=org.id)
    customer = subscription.get("customer")
    plan_name = subscription.get("items", {}).get("data", [{}])[0].get("price", {}).get("nickname") or metadata.get("plan")

    def assign_subscription_fields(target: BillingSubscription, resolved_status: str | None) -> None:
        target.stripe_subscription_id = subscription_id
        target.status = resolved_status
        target.plan = plan_name
        if isinstance(customer, str):
            target.stripe_customer_id = customer
        elif isinstance(customer, dict):
            target.stripe_customer_id = customer.get("id") or target.stripe_customer_id
        target.current_period_end = datetime.fromtimestamp(current_period_end, tz=timezone.utc) if current_period_end else None
        if cancel_at_period_end:
            target.canceled_at = (
                datetime.fromtimestamp(current_period_end, tz=timezone.utc)
                if current_period_end
                else datetime.now(timezone.utc)
            )
        target.metadata_json = metadata

    assign_subscription_fields(sub, subscription_status)
    db.add(sub)
    try:
        db.commit()
    except IntegrityError:
        # Stripe can deliver events in quick succession; re-load per-tenant row and apply update.
        db.rollback()
        org.metadata_json = metadata
        org.posting_paused = not org_active
        org.is_active = org_active
        db.add(org)
        sub = db.query(BillingSubscription).filter_by(tenant_id=org.id).one_or_none()
        if not sub:
            logger.exception("Unable to upsert billing subscription for org %s", org.id)
            return
        assign_subscription_fields(sub, subscription_status)
        db.add(sub)
        try:
            db.commit()
        except Exception:
            db.rollback()
            logger.exception("Unable to upsert billing subscription for org %s after IntegrityError retry", org.id)
            return
    except DataError:
        # If database enum constraints reject a Stripe status value, keep webhook processing alive.
        db.rollback()
        logger.warning(
            "Billing status normalization failed for org=%s sub=%s raw=%s normalized=%s; retrying with existing status",
            org.id,
            subscription_id,
            stripe_subscription_status,
            subscription_status,
        )
        org.metadata_json = metadata
        org.posting_paused = not org_active
        org.is_active = org_active
        db.add(org)
        fallback = db.query(BillingSubscription).filter_by(tenant_id=org.id).one_or_none()
        if not fallback:
            logger.exception("Unable to recover billing subscription row for org %s after DataError", org.id)
            return
        safe_status = fallback.status
        assign_subscription_fields(fallback, safe_status)
        db.add(fallback)
        try:
            db.commit()
        except Exception:
            db.rollback()
            logger.exception("Unable to upsert billing subscription for org %s after DataError fallback", org.id)
            return

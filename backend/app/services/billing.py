from __future__ import annotations

import logging
from typing import Any

import stripe

from backend.app.core.config import settings

logger = logging.getLogger(__name__)


class BillingService:
    def __init__(self) -> None:
        if settings.STRIPE_SECRET_KEY:
            stripe.api_key = settings.STRIPE_SECRET_KEY

    def create_checkout_session(
        self,
        *,
        email: str,
        company_name: str,
        plan: str = "starter",
    ) -> stripe.checkout.Session:
        if not settings.STRIPE_SECRET_KEY or not settings.STRIPE_PRICE_ID:
            raise ValueError("Stripe secret key and price id must be configured")
        success_url = settings.STRIPE_SUCCESS_URL or f"{settings.CLIENT_APP_URL}/payments/success"
        cancel_url = settings.STRIPE_CANCEL_URL or f"{settings.CLIENT_APP_URL}/payments/cancel"
        session = stripe.checkout.Session.create(
            mode="payment",
            payment_method_types=["card"],
            customer_email=email,
            line_items=[
                {
                    "price": settings.STRIPE_PRICE_ID,
                    "quantity": 1,
                }
            ],
            metadata={
                "company_name": company_name,
                "plan": plan,
            },
            success_url=success_url,
            cancel_url=cancel_url,
        )
        return session

    def verify_webhook(self, payload: bytes, signature: str | None) -> stripe.Event:
        if not settings.STRIPE_WEBHOOK_SECRET:
            raise ValueError("Stripe webhook secret not configured")
        return stripe.Webhook.construct_event(payload=payload, sig_header=signature, secret=settings.STRIPE_WEBHOOK_SECRET)

    @staticmethod
    def extract_checkout_data(session: dict[str, Any]) -> dict[str, Any]:
        metadata = session.get("metadata") or {}
        customer_details = session.get("customer_details") or {}
        return {
            "email": customer_details.get("email") or session.get("customer_email"),
            "company_name": metadata.get("company_name") or customer_details.get("name") or "New Client",
            "plan": metadata.get("plan") or "starter",
            "reference": session.get("id"),
        }

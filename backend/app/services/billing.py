from __future__ import annotations

import logging
from typing import Any, cast
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import stripe

from backend.app.core.config import settings

logger = logging.getLogger(__name__)


class BillingService:
    def __init__(self) -> None:
        if settings.STRIPE_SECRET_KEY:
            stripe.api_key = settings.STRIPE_SECRET_KEY

    def _get_or_create_customer(self, email: str) -> stripe.Customer:
        if not settings.STRIPE_SECRET_KEY:
            raise ValueError("Stripe secret key must be configured")
        existing = stripe.Customer.list(email=email, limit=1).data
        if existing:
            return existing[0]
        return stripe.Customer.create(email=email)

    def create_subscription_intent(
        self,
        *,
        email: str,
        company_name: str,
        plan: str = "starter",
    ) -> dict[str, str]:
        price_id = self._resolve_price_id(plan)
        if not price_id:
            raise ValueError("Stripe price id must be configured for this plan")
        customer = self._get_or_create_customer(email)
        subscription = stripe.Subscription.create(
          customer=customer.id,
          items=[{"price": price_id}],
          payment_behavior="default_incomplete",
          payment_settings={
              "save_default_payment_method": "on_subscription",
              "payment_method_types": ["card"],
          },
          metadata={"plan": plan, "company_name": company_name},
          expand=["latest_invoice.payment_intent"],
        )
        intent = subscription.latest_invoice.payment_intent
        if not intent or not intent.client_secret:
            raise ValueError("Unable to create payment intent for subscription")
        return {"subscription_id": subscription.id, "client_secret": intent.client_secret}

    def create_checkout_session(
        self,
        *,
        email: str,
        company_name: str,
        plan: str = "starter",
    ) -> stripe.checkout.Session:
        if not settings.STRIPE_SECRET_KEY:
            raise ValueError("Stripe secret key must be configured")
        success_url = settings.STRIPE_SUCCESS_URL or f"{settings.CLIENT_APP_URL}/payments/success"
        cancel_url = settings.STRIPE_CANCEL_URL or f"{settings.CLIENT_APP_URL}/payments/cancel"
        success_url = self._with_checkout_session_id(str(success_url))
        cancel_url = str(cancel_url)
        session = stripe.checkout.Session.create(
            mode="subscription",
            customer_email=email,
            line_items=cast(Any, [self._build_line_item(plan)]),
            metadata={
                "company_name": company_name,
                "plan": plan,
            },
            success_url=success_url,
            cancel_url=cancel_url,
        )
        return session

    def _resolve_price_id(self, plan: str) -> str | None:
        normalized = plan.strip().lower()
        if normalized == "starter" and settings.STRIPE_PRICE_ID_STARTER:
            return settings.STRIPE_PRICE_ID_STARTER
        if normalized == "pro" and settings.STRIPE_PRICE_ID_PRO:
            return settings.STRIPE_PRICE_ID_PRO
        if normalized == "agency" and settings.STRIPE_PRICE_ID_AGENCY:
            return settings.STRIPE_PRICE_ID_AGENCY
        return settings.STRIPE_PRICE_ID

    def _resolve_price_amount(self, plan: str) -> int | None:
        normalized = plan.strip().lower()
        if normalized == "starter" and settings.STRIPE_PRICE_AMOUNT_STARTER is not None:
            return settings.STRIPE_PRICE_AMOUNT_STARTER
        if normalized == "pro" and settings.STRIPE_PRICE_AMOUNT_PRO is not None:
            return settings.STRIPE_PRICE_AMOUNT_PRO
        if normalized == "agency" and settings.STRIPE_PRICE_AMOUNT_AGENCY is not None:
            return settings.STRIPE_PRICE_AMOUNT_AGENCY
        return settings.STRIPE_PRICE_AMOUNT

    def _build_line_item(self, plan: str) -> dict[str, Any]:
        price_id = self._resolve_price_id(plan)
        if price_id:
            return {
                "price": price_id,
                "quantity": 1,
            }
        amount = self._resolve_price_amount(plan)
        if amount is None:
            raise ValueError("Stripe price id or amount must be configured for this plan")
        if amount < 0:
            raise ValueError("Stripe price amount must be zero or greater")
        return {
            "price_data": {
                "currency": settings.STRIPE_PRICE_CURRENCY,
                "product_data": {
                    "name": self._plan_display_name(plan),
                },
                "unit_amount": amount,
                "recurring": {
                    "interval": settings.STRIPE_PRICE_INTERVAL,
                },
            },
            "quantity": 1,
        }

    @staticmethod
    def _plan_display_name(plan: str) -> str:
        normalized = plan.strip().lower()
        if normalized == "pro":
            return "Pro"
        if normalized == "agency":
            return "Agency"
        return "Starter"

    @staticmethod
    def _with_checkout_session_id(success_url: str) -> str:
        if "{CHECKOUT_SESSION_ID}" in success_url:
            return success_url
        parts = urlsplit(success_url)
        query = dict(parse_qsl(parts.query, keep_blank_values=True))
        query["session_id"] = "{CHECKOUT_SESSION_ID}"
        return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))

    def verify_webhook(self, payload: bytes, signature: str | None) -> stripe.Event:
        if not settings.STRIPE_WEBHOOK_SECRET:
            raise ValueError("Stripe webhook secret not configured")
        return stripe.Webhook.construct_event(payload=payload, sig_header=signature, secret=settings.STRIPE_WEBHOOK_SECRET)

    def get_subscription(self, subscription_id: str) -> stripe.Subscription:
        if not settings.STRIPE_SECRET_KEY:
            raise ValueError("Stripe secret key must be configured")
        return stripe.Subscription.retrieve(subscription_id, expand=["customer"])

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

from __future__ import annotations

import logging
from collections.abc import Iterable
from typing import Any, cast
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import stripe

from backend.app.core.config import settings

logger = logging.getLogger(__name__)


class BillingService:
    _BLOCKING_SUBSCRIPTION_STATUSES = frozenset(
        {
            "incomplete",
            "trialing",
            "active",
            "past_due",
            "unpaid",
            "paused",
        }
    )

    def __init__(self) -> None:
        if settings.STRIPE_SECRET_KEY:
            stripe.api_key = settings.STRIPE_SECRET_KEY

    def _get_or_create_customer(self, email: str) -> stripe.Customer:
        if not settings.STRIPE_SECRET_KEY:
            raise ValueError("Stripe secret key must be configured")
        normalized_email = self._normalize_email(email)
        existing = stripe.Customer.list(email=normalized_email, limit=1).data
        if existing:
            return existing[0]
        return stripe.Customer.create(email=normalized_email)

    def create_subscription_intent(
        self,
        *,
        email: str,
        company_name: str,
        plan: str = "starter",
    ) -> dict[str, str | bool | None]:
        normalized_email = self._normalize_email(email)
        self._raise_if_subscription_exists(normalized_email)
        price_id = self._resolve_price_id(plan)
        if not price_id:
            raise ValueError("Stripe price id must be configured for this plan")
        customer = self._get_or_create_customer(normalized_email)
        subscription = stripe.Subscription.create(
            customer=customer.id,
            items=[{"price": price_id}],
            payment_behavior="default_incomplete",
            payment_settings={
                "save_default_payment_method": "on_subscription",
                "payment_method_types": ["card"],
            },
            metadata={"plan": plan, "company_name": company_name},
            expand=["latest_invoice.payment_intent", "pending_setup_intent"],
        )
        intent = subscription.latest_invoice.payment_intent
        if intent and intent.client_secret:
            return {
                "subscription_id": subscription.id,
                "client_secret": intent.client_secret,
                "requires_payment_method": True,
            }

        # Some Stripe setups (for example trialing subscriptions) can be created
        # without an immediate payment intent.
        status = str(getattr(subscription, "status", "") or "").lower()
        if status in {"trialing", "active"}:
            logger.info(
                "Subscription %s created without immediate payment intent (status=%s)",
                subscription.id,
                status,
            )
            return {
                "subscription_id": subscription.id,
                "client_secret": None,
                "requires_payment_method": False,
            }

        raise ValueError("Unable to create payment intent for subscription")

    def create_checkout_session(
        self,
        *,
        email: str,
        company_name: str,
        plan: str = "starter",
    ) -> stripe.checkout.Session:
        if not settings.STRIPE_SECRET_KEY:
            raise ValueError("Stripe secret key must be configured")
        normalized_email = self._normalize_email(email)
        self._raise_if_subscription_exists(normalized_email)
        success_url = settings.STRIPE_SUCCESS_URL or f"{settings.CLIENT_APP_URL}/payments/success"
        cancel_url = settings.STRIPE_CANCEL_URL or f"{settings.CLIENT_APP_URL}/payments/cancel"
        success_url = self._with_checkout_session_id(str(success_url))
        cancel_url = str(cancel_url)
        session = stripe.checkout.Session.create(
            mode="subscription",
            customer_email=normalized_email,
            line_items=cast(Any, [self._build_line_item(plan)]),
            metadata={
                "company_name": company_name,
                "plan": plan,
            },
            success_url=success_url,
            cancel_url=cancel_url,
        )
        return session

    @staticmethod
    def _normalize_email(email: str) -> str:
        normalized_email = email.strip().lower()
        if not normalized_email:
            raise ValueError("Email is required")
        return normalized_email

    @staticmethod
    def _iter_stripe_list(result: Any) -> Iterable[Any]:
        auto_paging_iter = getattr(result, "auto_paging_iter", None)
        if callable(auto_paging_iter):
            return cast(Iterable[Any], auto_paging_iter())
        data = getattr(result, "data", None)
        if isinstance(data, list):
            return data
        if isinstance(result, list):
            return result
        return []

    def _raise_if_subscription_exists(self, email: str) -> None:
        if not settings.STRIPE_SECRET_KEY:
            raise ValueError("Stripe secret key must be configured")

        customers = stripe.Customer.list(email=email, limit=100)
        for customer in self._iter_stripe_list(customers):
            customer_id = getattr(customer, "id", None)
            if not customer_id:
                continue
            subscriptions = stripe.Subscription.list(customer=customer_id, status="all", limit=100)
            for subscription in self._iter_stripe_list(subscriptions):
                subscription_status = str(getattr(subscription, "status", "") or "").lower()
                if subscription_status in self._BLOCKING_SUBSCRIPTION_STATUSES:
                    logger.info(
                        "Blocked duplicate subscription attempt for %s; existing subscription=%s status=%s",
                        email,
                        getattr(subscription, "id", ""),
                        subscription_status,
                    )
                    raise ValueError("An active or pending subscription already exists for this email")

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

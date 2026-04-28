from __future__ import annotations

import uuid
from datetime import datetime, timezone

from backend.app.features.stripe_billing.router import (
    _record_stripe_webhook_event_once,
    _update_org_status,
)
from backend.app.models.billing.billing_subscription import BillingSubscription
from backend.app.models.billing.stripe_webhook_event import StripeWebhookEvent
from backend.app.models.identity.organization import Organization
from backend.app.models.enums import OrganizationType


PERIOD_END = 1_893_456_000


class _FakeBilling:
    def __init__(self, subscriptions: dict[str, dict]):
        self.subscriptions = subscriptions

    def get_subscription(self, subscription_id: str) -> dict:
        return self.subscriptions[subscription_id]


def _stripe_subscription(
    *,
    tenant_id: uuid.UUID,
    subscription_id: str,
    status: str,
    plan: str = "starter",
    addons: str | None = None,
) -> dict:
    metadata = {
        "tenant_id": str(tenant_id),
        "plan": plan,
    }
    if addons:
        metadata["addons"] = addons
    return {
        "id": subscription_id,
        "metadata": metadata,
        "customer": {"id": "cus_123", "email": "owner@example.com"},
        "status": status,
        "current_period_end": PERIOD_END,
        "cancel_at_period_end": False,
        "items": {"data": [{"price": {"nickname": "Stripe nickname"}}]},
    }


def _org(db_session, *, active: bool = False) -> Organization:
    org = Organization(
        name="Billing Org",
        org_type=OrganizationType.BUSINESS,
        is_active=active,
        posting_paused=not active,
    )
    db_session.add(org)
    db_session.commit()
    return org


def test_successful_subscription_webhook_creates_tenant_subscription(db_session):
    org = _org(db_session)
    billing = _FakeBilling(
        {
            "sub_active": _stripe_subscription(
                tenant_id=org.id,
                subscription_id="sub_active",
                status="active",
                plan="pro",
                addons='["growth_add_on"]',
            )
        }
    )

    _update_org_status(db_session, billing, "sub_active", None, None, None)

    db_session.refresh(org)
    sub = db_session.query(BillingSubscription).filter_by(tenant_id=org.id).one()
    assert org.is_active is True
    assert org.posting_paused is False
    assert sub.stripe_subscription_id == "sub_active"
    assert sub.stripe_customer_id == "cus_123"
    assert sub.status == "active"
    assert sub.plan == "pro"
    assert sub.current_period_end.replace(tzinfo=timezone.utc) == datetime.fromtimestamp(
        PERIOD_END,
        tz=timezone.utc,
    )
    assert sub.metadata_json["tenant_id"] == str(org.id)
    assert sub.metadata_json["addons"] == '["growth_add_on"]'


def test_failed_or_incomplete_subscription_webhook_does_not_unlock_dashboard(db_session):
    org = _org(db_session)
    billing = _FakeBilling(
        {
            "sub_incomplete": _stripe_subscription(
                tenant_id=org.id,
                subscription_id="sub_incomplete",
                status="incomplete",
            )
        }
    )

    _update_org_status(db_session, billing, "sub_incomplete", None, None, None)

    db_session.refresh(org)
    sub = db_session.query(BillingSubscription).filter_by(tenant_id=org.id).one()
    assert org.is_active is False
    assert org.posting_paused is True
    assert sub.status == "canceled"
    assert sub.status not in {"active", "trialing"}


def test_duplicate_subscription_updates_are_idempotent(db_session):
    org = _org(db_session)
    billing = _FakeBilling(
        {
            "sub_active": _stripe_subscription(
                tenant_id=org.id,
                subscription_id="sub_active",
                status="trialing",
            )
        }
    )

    _update_org_status(db_session, billing, "sub_active", None, None, None)
    _update_org_status(db_session, billing, "sub_active", None, None, None)

    rows = db_session.query(BillingSubscription).filter_by(tenant_id=org.id).all()
    db_session.refresh(org)
    assert len(rows) == 1
    assert rows[0].stripe_subscription_id == "sub_active"
    assert rows[0].status == "trialing"
    assert org.is_active is True


def test_stale_inactive_subscription_event_cannot_overwrite_newer_active_subscription(db_session):
    org = _org(db_session, active=True)
    existing = BillingSubscription(
        tenant_id=org.id,
        stripe_subscription_id="sub_new",
        stripe_customer_id="cus_123",
        status="active",
        plan="pro",
    )
    db_session.add(existing)
    db_session.commit()
    billing = _FakeBilling(
        {
            "sub_old": _stripe_subscription(
                tenant_id=org.id,
                subscription_id="sub_old",
                status="canceled",
                plan="starter",
            )
        }
    )

    _update_org_status(db_session, billing, "sub_old", "canceled", PERIOD_END, False)

    db_session.refresh(org)
    sub = db_session.query(BillingSubscription).filter_by(tenant_id=org.id).one()
    assert org.is_active is True
    assert org.posting_paused is False
    assert sub.stripe_subscription_id == "sub_new"
    assert sub.status == "active"
    assert sub.plan == "pro"


def test_new_active_subscription_can_replace_old_inactive_subscription(db_session):
    org = _org(db_session)
    existing = BillingSubscription(
        tenant_id=org.id,
        stripe_subscription_id="sub_old",
        stripe_customer_id="cus_123",
        status="canceled",
        plan="starter",
    )
    db_session.add(existing)
    db_session.commit()
    billing = _FakeBilling(
        {
            "sub_new": _stripe_subscription(
                tenant_id=org.id,
                subscription_id="sub_new",
                status="active",
                plan="agency",
            )
        }
    )

    _update_org_status(db_session, billing, "sub_new", "active", PERIOD_END, False)

    db_session.refresh(org)
    sub = db_session.query(BillingSubscription).filter_by(tenant_id=org.id).one()
    assert org.is_active is True
    assert org.posting_paused is False
    assert sub.stripe_subscription_id == "sub_new"
    assert sub.status == "active"
    assert sub.plan == "agency"


def test_webhook_event_ledger_rejects_duplicate_event_ids(db_session):
    event = {"api_version": "2026-02-25.clover", "livemode": False}

    first = _record_stripe_webhook_event_once(
        db_session,
        event_id="evt_duplicate",
        event_type="customer.subscription.updated",
        event=event,
    )
    second = _record_stripe_webhook_event_once(
        db_session,
        event_id="evt_duplicate",
        event_type="customer.subscription.updated",
        event=event,
    )

    rows = db_session.query(StripeWebhookEvent).all()
    assert first is True
    assert second is False
    assert len(rows) == 1
    assert rows[0].event_id == "evt_duplicate"

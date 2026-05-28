from __future__ import annotations

from types import SimpleNamespace

import pytest

from backend.app.core.config import settings
from backend.app.services.billing.billing import BillingService
import backend.app.services.billing.billing as billing_module


class _FakeStripeList:
    def __init__(self, data):
        self.data = data

    def auto_paging_iter(self):
        return iter(self.data)


def _configure_billing_settings(monkeypatch):
    monkeypatch.setattr(settings, "STRIPE_SECRET_KEY", "sk_test_123")
    monkeypatch.setattr(settings, "STRIPE_PRICE_ID_STANDARD", "price_249")
    monkeypatch.setattr(settings, "STRIPE_PRICE_ID_FRIENDS_FAMILY", "price_129")


def test_create_subscription_intent_blocks_existing_active_subscription(monkeypatch):
    _configure_billing_settings(monkeypatch)

    monkeypatch.setattr(
        billing_module.stripe.Customer,
        "list",
        lambda **kwargs: _FakeStripeList([SimpleNamespace(id="cus_123")]),
    )
    monkeypatch.setattr(
        billing_module.stripe.Subscription,
        "list",
        lambda **kwargs: _FakeStripeList([SimpleNamespace(id="sub_existing", status="active")]),
    )

    created = {"called": False}

    def _fake_create(**kwargs):
        created["called"] = True
        return None

    monkeypatch.setattr(billing_module.stripe.Subscription, "create", _fake_create)

    service = BillingService()
    with pytest.raises(ValueError, match="already exists"):
        service.create_subscription_intent(
            email="Owner@Example.com",
            company_name="Acme Corp",
            plan="standard_249",
        )

    assert created["called"] is False


def test_create_checkout_session_blocks_existing_active_subscription(monkeypatch):
    _configure_billing_settings(monkeypatch)

    monkeypatch.setattr(
        billing_module.stripe.Customer,
        "list",
        lambda **kwargs: _FakeStripeList([SimpleNamespace(id="cus_123")]),
    )
    monkeypatch.setattr(
        billing_module.stripe.Subscription,
        "list",
        lambda **kwargs: _FakeStripeList([SimpleNamespace(id="sub_existing", status="trialing")]),
    )

    created = {"called": False}

    def _fake_checkout_create(**kwargs):
        created["called"] = True
        return None

    monkeypatch.setattr(billing_module.stripe.checkout.Session, "create", _fake_checkout_create)

    service = BillingService()
    with pytest.raises(ValueError, match="already exists"):
        service.create_checkout_session(
            email="Owner@Example.com",
            company_name="Acme Corp",
            plan="standard_249",
        )

    assert created["called"] is False


def test_create_checkout_session_maps_metadata_and_relative_redirects(monkeypatch):
    _configure_billing_settings(monkeypatch)
    monkeypatch.setattr(settings, "CLIENT_APP_URL", "https://app.example.test")
    monkeypatch.setattr(settings, "STRIPE_SUCCESS_URL", "https://yourapp.com/payments/success")
    monkeypatch.setattr(settings, "STRIPE_CANCEL_URL", "https://yourapp.com/payments/cancel")

    monkeypatch.setattr(
        billing_module.stripe.Customer,
        "list",
        lambda **kwargs: _FakeStripeList([SimpleNamespace(id="cus_123")]),
    )
    monkeypatch.setattr(
        billing_module.stripe.Subscription,
        "list",
        lambda **kwargs: _FakeStripeList([]),
    )

    captured = {}

    def _fake_checkout_create(**kwargs):
        captured.update(kwargs)
        return SimpleNamespace(id="cs_test_123", url="https://checkout.stripe.test/session")

    monkeypatch.setattr(billing_module.stripe.checkout.Session, "create", _fake_checkout_create)

    service = BillingService()
    session = service.create_checkout_session(
        email="Owner@Example.com",
        company_name="Acme Corp",
        plan="standard_249",
        tenant_id="tenant-123",
        user_id="user-123",
        success_path="/onboarding?payment=success",
        cancel_path="/onboarding?payment=canceled",
    )

    assert session.id == "cs_test_123"
    assert captured["client_reference_id"] == "tenant-123"
    assert captured["metadata"]["tenant_id"] == "tenant-123"
    assert captured["metadata"]["user_id"] == "user-123"
    assert captured["subscription_data"]["metadata"]["tenant_id"] == "tenant-123"
    assert captured["success_url"] == "https://app.example.test/onboarding?payment=success&session_id=%7BCHECKOUT_SESSION_ID%7D"
    assert captured["cancel_url"] == "https://app.example.test/onboarding?payment=canceled"


def test_create_checkout_session_rejects_retired_addons(monkeypatch):
    _configure_billing_settings(monkeypatch)
    service = BillingService()
    with pytest.raises(ValueError, match="add-ons are no longer supported"):
        service.create_checkout_session(
            email="Owner@Example.com",
            company_name="Acme Corp",
            plan="standard_249",
            addons=["Growth Add-On"],
        )


def test_create_checkout_session_supports_invite_selected_pricing(monkeypatch):
    _configure_billing_settings(monkeypatch)
    monkeypatch.setattr(settings, "STRIPE_PRICE_ID_FRIENDS_FAMILY", "price_129")
    monkeypatch.setattr(settings, "STRIPE_PRICE_ID_STANDARD", "price_249")

    monkeypatch.setattr(
        billing_module.stripe.Customer,
        "list",
        lambda **kwargs: _FakeStripeList([SimpleNamespace(id="cus_123")]),
    )
    monkeypatch.setattr(
        billing_module.stripe.Subscription,
        "list",
        lambda **kwargs: _FakeStripeList([]),
    )

    captured = {}

    def _fake_checkout_create(**kwargs):
        captured.update(kwargs)
        return SimpleNamespace(id="cs_test_123", url="https://checkout.stripe.test/session")

    monkeypatch.setattr(billing_module.stripe.checkout.Session, "create", _fake_checkout_create)

    service = BillingService()
    service.create_checkout_session(
        email="Owner@Example.com",
        company_name="Acme Corp",
        plan="standard_249",
    )

    assert captured["line_items"] == [{"price": "price_249", "quantity": 1}]
    assert captured["metadata"]["plan"] == "standard_249"


def test_create_checkout_session_rejects_retired_starter_pro_agency_plans(monkeypatch):
    _configure_billing_settings(monkeypatch)
    service = BillingService()

    for retired_plan in ["starter", "pro", "agency", "75", "99", "149"]:
        with pytest.raises(ValueError, match="Unknown Stripe billing plan"):
            service.create_checkout_session(
                email="Owner@Example.com",
                company_name="Acme Corp",
                plan=retired_plan,
            )


def test_create_subscription_intent_allows_new_when_previous_subscription_canceled(monkeypatch):
    _configure_billing_settings(monkeypatch)

    def _fake_customer_list(**kwargs):
        assert kwargs["email"] == "owner@example.com"
        return _FakeStripeList([SimpleNamespace(id="cus_123")])

    monkeypatch.setattr(billing_module.stripe.Customer, "list", _fake_customer_list)
    monkeypatch.setattr(
        billing_module.stripe.Subscription,
        "list",
        lambda **kwargs: _FakeStripeList([SimpleNamespace(id="sub_old", status="canceled")]),
    )

    def _fake_subscription_create(**kwargs):
        return SimpleNamespace(
            id="sub_new",
            status="incomplete",
            latest_invoice=SimpleNamespace(
                payment_intent=SimpleNamespace(client_secret="pi_secret_123"),
            ),
        )

    monkeypatch.setattr(billing_module.stripe.Subscription, "create", _fake_subscription_create)

    service = BillingService()
    result = service.create_subscription_intent(
        email="Owner@Example.com",
        company_name="Acme Corp",
        plan="friends_family",
    )

    assert result["subscription_id"] == "sub_new"
    assert result["client_secret"] == "pi_secret_123"
    assert result["requires_payment_method"] is True


def test_set_subscription_cancel_at_period_end_updates_stripe(monkeypatch):
    _configure_billing_settings(monkeypatch)
    captured = {}

    def _fake_modify(subscription_id, **kwargs):
        captured["subscription_id"] = subscription_id
        captured.update(kwargs)
        return SimpleNamespace(id=subscription_id, cancel_at_period_end=kwargs["cancel_at_period_end"])

    monkeypatch.setattr(billing_module.stripe.Subscription, "modify", _fake_modify)

    service = BillingService()
    subscription = service.set_subscription_cancel_at_period_end("sub_123", cancel_at_period_end=True)

    assert subscription.id == "sub_123"
    assert subscription.cancel_at_period_end is True
    assert captured == {"subscription_id": "sub_123", "cancel_at_period_end": True}

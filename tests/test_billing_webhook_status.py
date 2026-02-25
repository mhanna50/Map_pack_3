from __future__ import annotations

import pytest

from backend.app.api.billing import _normalize_billing_status


@pytest.mark.parametrize(
    ("raw_status", "expected"),
    [
        ("active", "active"),
        ("trialing", "trialing"),
        ("past_due", "past_due"),
        ("canceled", "canceled"),
        ("cancelled", "canceled"),
        ("incomplete", "canceled"),
        ("incomplete_expired", "canceled"),
        ("unpaid", "canceled"),
        ("paused", "canceled"),
        ("unexpected_new_status", "canceled"),
        ("", None),
        (None, None),
    ],
)
def test_normalize_billing_status(raw_status: str | None, expected: str | None) -> None:
    assert _normalize_billing_status(raw_status) == expected

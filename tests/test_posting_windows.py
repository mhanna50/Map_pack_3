from __future__ import annotations

import random

from backend.app.models.enums import OrganizationType
from backend.app.models.location import Location
from backend.app.models.organization import Organization
from backend.app.models.posting_window_stat import PostingWindowStat
from backend.app.services.posting_windows import PostingWindowService


def _org_and_location(db_session):
    org = Organization(name="Window Org", org_type=OrganizationType.AGENCY)
    db_session.add(org)
    db_session.flush()
    location = Location(name="Window HQ", organization_id=org.id, timezone="UTC")
    db_session.add(location)
    db_session.flush()
    return org, location


def test_posting_window_service_prefers_high_performance(monkeypatch, db_session):
    org, location = _org_and_location(db_session)
    db_session.add(
        PostingWindowStat(
            organization_id=org.id,
            location_id=location.id,
            window_id="morning",
            impressions=100,
            clicks=5,
            conversions=1,
        )
    )
    db_session.add(
        PostingWindowStat(
            organization_id=org.id,
            location_id=location.id,
            window_id="evening",
            impressions=80,
            clicks=20,
            conversions=5,
        )
    )
    db_session.commit()

    def deterministic(alpha, beta):
        return alpha / (alpha + beta)

    monkeypatch.setattr(random, "betavariate", deterministic)
    service = PostingWindowService(db_session)
    choice = service.choose_window(org.id, location.id)
    assert choice["id"] == "evening"

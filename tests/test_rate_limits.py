from __future__ import annotations

import uuid

import pytest

from backend.app.models.organization import Organization
from backend.app.models.location import Location
from backend.app.services.rate_limits import RateLimitService, RateLimitError


def test_rate_limit_service_enforces_window(db_session):
    org = Organization(name="RL Org")
    db_session.add(org)
    db_session.flush()
    loc = Location(name="RL Location", organization_id=org.id, timezone="UTC")
    db_session.add(loc)
    db_session.commit()

    service = RateLimitService(db_session, limit_per_window=1)
    # first call passes
    service.check_and_increment(organization_id=org.id, location_id=loc.id)
    # second call exceeds limit
    with pytest.raises(RateLimitError):
        service.check_and_increment(organization_id=org.id, location_id=loc.id)

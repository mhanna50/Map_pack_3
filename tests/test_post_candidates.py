from __future__ import annotations

from datetime import datetime, timedelta, timezone

from backend.app.models.daily_signal import DailySignal
from backend.app.models.enums import OrganizationType
from backend.app.models.location import Location
from backend.app.models.organization import Organization
from backend.app.services.post_candidates import PostCandidateService


def _setup(db_session):
    org = Organization(name="Candidate Org", org_type=OrganizationType.AGENCY)
    db_session.add(org)
    db_session.flush()
    location = Location(name="Candidate Location", organization_id=org.id, timezone="UTC")
    db_session.add(location)
    db_session.commit()
    return org, location


def test_generate_post_candidate_scores_high_when_stale(db_session):
    org, location = _setup(db_session)
    signal = DailySignal(
        organization_id=org.id,
        location_id=location.id,
        signal_date=datetime.now(timezone.utc).date(),
        days_since_post=10,
        review_count_7d=3,
        avg_rating_30d=4.5,
        rank_delta_7d=-2,
        extra_metrics={
            "posts_last_7d": 0,
            "new_media_14d": 2,
            "gbp_connection_ok": True,
        },
    )
    db_session.add(signal)
    db_session.commit()

    service = PostCandidateService(db_session)
    candidate = service.generate(organization_id=org.id, location_id=location.id)
    assert candidate is not None
    assert candidate.score and candidate.score > 40

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from backend.app.models.content.daily_signal import DailySignal
from backend.app.models.enums import OrganizationType
from backend.app.models.google_business.location import Location
from backend.app.models.identity.organization import Organization
from backend.app.models.rank_tracking.gbp_post_keyword_mapping import GbpPostKeywordMapping
from backend.app.models.rank_tracking.keyword_campaign_cycle import KeywordCampaignCycle
from backend.app.services.posts.post_candidates import PostCandidateService


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


def test_generate_post_candidate_claims_planned_keyword_mapping(db_session):
    org, location = _setup(db_session)
    target_date = datetime.now(timezone.utc).date()
    cycle = KeywordCampaignCycle(
        organization_id=org.id,
        location_id=location.id,
        cycle_year=target_date.year,
        cycle_month=target_date.month,
        status="completed",
    )
    db_session.add(cycle)
    db_session.flush()
    mapping = GbpPostKeywordMapping(
        organization_id=org.id,
        location_id=location.id,
        campaign_cycle_id=cycle.id,
        target_keyword="emergency plumbing Austin",
        service_name="Emergency Plumbing",
        post_angle="service_post",
        post_type="update",
        publish_date=target_date,
        status="planned",
    )
    signal = DailySignal(
        organization_id=org.id,
        location_id=location.id,
        signal_date=target_date,
        days_since_post=10,
        review_count_7d=0,
        extra_metrics={"posts_last_7d": 0, "new_media_14d": 1, "gbp_connection_ok": True},
    )
    db_session.add(mapping)
    db_session.add(signal)
    db_session.commit()

    candidate = PostCandidateService(db_session).generate(
        organization_id=org.id,
        location_id=location.id,
        target_date=target_date,
    )
    db_session.refresh(mapping)

    assert candidate is not None
    assert candidate.reason_json["keyword_mapping_id"] == str(mapping.id)
    assert candidate.reason_json["service_name"] == "Emergency Plumbing"
    assert candidate.reason_json["target_keyword"] == "emergency plumbing Austin"
    assert mapping.status == "candidate"
    assert mapping.post_candidate_id == candidate.id
    assert mapping.post_id is None

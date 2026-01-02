from __future__ import annotations

from datetime import datetime, timedelta, timezone

from backend.app.models.enums import OrganizationType, PostStatus, PostType, ReviewRating
from backend.app.models.location import Location
from backend.app.models.location_settings import LocationSettings
from backend.app.models.organization import Organization
from backend.app.models.post import Post
from backend.app.models.review import Review
from backend.app.services.competitor_monitoring import CompetitorMonitoringService


def _make_location(db_session):
    org = Organization(name="Compete Org", org_type=OrganizationType.AGENCY)
    db_session.add(org)
    db_session.flush()
    location = Location(name="Compete Location", organization_id=org.id, timezone="UTC")
    db_session.add(location)
    db_session.flush()
    settings = LocationSettings(location_id=location.id, posting_schedule={"days": ["mon"]})
    db_session.add(settings)
    db_session.commit()
    return org, location


def test_manual_and_auto_competitors(db_session):
    org, location = _make_location(db_session)
    service = CompetitorMonitoringService(db_session)
    manual = service.upsert_manual_competitors(
        organization_id=org.id,
        location_id=location.id,
        competitors=[{"name": "Rival HVAC", "category": "HVAC"}],
    )
    assert len(manual) == 1
    auto = service.auto_discover_competitors(
        organization_id=org.id,
        location_id=location.id,
        top_n=3,
    )
    assert len(auto) == 3
    all_competitors = service.list_competitors(location_id=location.id)
    assert len(all_competitors) == 4


def test_monitoring_creates_snapshots_and_gaps(db_session):
    org, location = _make_location(db_session)
    service = CompetitorMonitoringService(db_session)
    service.auto_discover_competitors(
        organization_id=org.id,
        location_id=location.id,
        top_n=2,
    )
    recent_review = Review(
        organization_id=org.id,
        location_id=location.id,
        external_review_id="rvw-1",
        author_name="Alice",
        rating=ReviewRating.FIVE,
        comment="Great job",
    )
    recent_review.created_at = datetime.now(timezone.utc) - timedelta(days=2)
    db_session.add(recent_review)
    db_session.add(
        Post(
            organization_id=org.id,
            location_id=location.id,
            post_type=PostType.UPDATE,
            body="General update",
            status=PostStatus.PUBLISHED,
        )
    )
    db_session.commit()

    result = service.run_monitoring(organization_id=org.id, location_id=location.id)
    assert result["status"] == "competitors_monitored"
    snapshots = service.list_snapshots(location_id=location.id)
    assert len(snapshots) == 2
    assert isinstance(snapshots[0].gap_flags, list)
    assert snapshots[0].captured_at is not None


def test_schedule_monitoring_creates_action(db_session):
    org, location = _make_location(db_session)
    service = CompetitorMonitoringService(db_session)
    action = service.schedule_monitoring(organization_id=org.id, location_id=location.id)
    assert action.action_type.value == "monitor_competitors"

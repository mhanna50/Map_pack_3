from __future__ import annotations

from datetime import datetime, timedelta, timezone

from backend.app.models.enums import OrganizationType, PostStatus, PostType, ReviewRating
from backend.app.models.location import Location
from backend.app.models.organization import Organization
from backend.app.models.post import Post
from backend.app.models.review import Review
from backend.app.models.rank_snapshot import RankSnapshot
from backend.app.services.daily_signals import DailySignalService


def _setup(db_session):
    org = Organization(name="Signals Org", org_type=OrganizationType.AGENCY)
    db_session.add(org)
    db_session.flush()
    location = Location(name="Signals Location", organization_id=org.id, timezone="UTC")
    db_session.add(location)
    db_session.commit()
    return org, location


def test_compute_daily_signals(db_session):
    org, location = _setup(db_session)
    now = datetime.now(timezone.utc)
    post = Post(
        organization_id=org.id,
        location_id=location.id,
        body="Post body",
        post_type=PostType.UPDATE,
        status=PostStatus.PUBLISHED,
        published_at=now - timedelta(days=2),
    )
    db_session.add(post)
    review = Review(
        organization_id=org.id,
        location_id=location.id,
        external_review_id="rev-1",
        rating=ReviewRating.FOUR,
        comment="Great",
        created_at=now - timedelta(days=1),
    )
    db_session.add(review)
    rank_old = RankSnapshot(
        organization_id=org.id,
        location_id=location.id,
        keyword_id=None,
        grid_point_id=None,
        checked_at=now - timedelta(days=7),
        rank=3,
    )
    rank_new = RankSnapshot(
        organization_id=org.id,
        location_id=location.id,
        keyword_id=None,
        grid_point_id=None,
        checked_at=now - timedelta(days=1),
        rank=5,
    )
    db_session.add_all([rank_old, rank_new])
    db_session.commit()

    service = DailySignalService(db_session)
    signal = service.compute(organization_id=org.id, location_id=location.id)
    assert signal.days_since_post == 2
    assert signal.review_count_7d == 1
    assert signal.avg_rating_30d == 4.0
    assert signal.rank_delta_7d == 2

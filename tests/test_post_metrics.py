from __future__ import annotations

from datetime import datetime, timezone

from backend.app.models.bucket_performance import BucketPerformance
from backend.app.models.enums import OrganizationType, PostStatus, PostType
from backend.app.models.location import Location
from backend.app.models.organization import Organization
from backend.app.models.post import Post
from backend.app.models.posting_window_stat import PostingWindowStat
from backend.app.services.post_metrics import PostMetricsService


def _make_post(db_session):
    org = Organization(name="Metrics Org", org_type=OrganizationType.AGENCY)
    db_session.add(org)
    db_session.flush()
    location = Location(name="Metrics HQ", organization_id=org.id, timezone="UTC")
    db_session.add(location)
    db_session.flush()
    post = Post(
        organization_id=org.id,
        location_id=location.id,
        post_type=PostType.UPDATE,
        status=PostStatus.PUBLISHED,
        body="Test body",
        bucket="service_spotlight",
        topic_tags=["cooling"],
    )
    post.window_id = "morning"
    post.published_at = datetime.now(timezone.utc)
    db_session.add(post)
    db_session.commit()
    return post


def test_post_metrics_records_daily_rollup(db_session):
    post = _make_post(db_session)
    service = PostMetricsService(db_session)
    record = service.record_publish_outcome(
        post,
        metrics={"views": 120, "clicks": 15, "actions": 4},
    )
    assert record.views == 120
    stat = db_session.query(PostingWindowStat).filter_by(window_id="morning").one()
    assert stat.clicks == 15
    perf = (
        db_session.query(BucketPerformance)
        .filter(
            BucketPerformance.organization_id == post.organization_id,
            BucketPerformance.location_id == post.location_id,
            BucketPerformance.bucket == post.bucket,
            BucketPerformance.topic_tag == "cooling",
        )
        .one()
    )
    assert perf.score > 0


def test_post_metrics_handles_missing_metrics(db_session):
    post = _make_post(db_session)
    service = PostMetricsService(db_session)
    record = service.record_publish_outcome(post, metrics=None)
    assert record.views == 1
    stat = db_session.query(PostingWindowStat).filter_by(window_id="morning").one()
    assert stat.impressions == 1

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from backend.app.models.identity.organization import Organization
from backend.app.models.google_business.location import Location
from backend.app.models.content.content_plan import ContentPlan
from backend.app.models.enums import ContentPlanStatus, PostJobStatus
from backend.app.services.posts.post_jobs import PostJobService


def _setup(db_session):
    org = Organization(name="Job Org")
    db_session.add(org)
    db_session.flush()
    loc = Location(name="Job Loc", organization_id=org.id, timezone="UTC")
    db_session.add(loc)
    db_session.flush()
    plan = ContentPlan(
        organization_id=org.id,
        location_id=loc.id,
        target_date=datetime.now(timezone.utc).date(),
        status=ContentPlanStatus.PLANNED,
    )
    db_session.add(plan)
    db_session.commit()
    return org, loc, plan


def test_post_job_dedupe(db_session):
    org, loc, plan = _setup(db_session)
    service = PostJobService(db_session)
    run_at = datetime.now(timezone.utc)
    job1 = service.queue_from_plan(plan, run_at=run_at)
    job2 = service.queue_from_plan(plan, run_at=run_at)
    assert job1.id == job2.id


def test_post_job_transient_failure_stays_retryable(db_session):
    org, loc, plan = _setup(db_session)
    service = PostJobService(db_session)
    job = service.queue_from_plan(plan, run_at=datetime.now(timezone.utc))

    def boom(post):
        raise RuntimeError("temporary publisher outage")

    service.publisher.publish_post = boom  # type: ignore[method-assign]

    with pytest.raises(RuntimeError):
        service.execute(job.id)

    db_session.refresh(job)
    assert job.attempts == 1
    assert job.status == PostJobStatus.QUEUED


def test_post_job_final_failure_stops_retrying(db_session):
    org, loc, plan = _setup(db_session)
    service = PostJobService(db_session)
    job = service.queue_from_plan(plan, run_at=datetime.now(timezone.utc))
    job.max_attempts = 1
    db_session.add(job)
    db_session.commit()

    def boom(post):
        raise RuntimeError("permanent publisher outage")

    service.publisher.publish_post = boom  # type: ignore[method-assign]

    result = service.execute(job.id)

    db_session.refresh(job)
    assert result["status"] == "failed"
    assert job.attempts == 1
    assert job.status == PostJobStatus.FAILED

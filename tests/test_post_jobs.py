from __future__ import annotations

from datetime import datetime, timezone

from backend.app.models.organization import Organization
from backend.app.models.location import Location
from backend.app.models.content_plan import ContentPlan
from backend.app.models.enums import ContentPlanStatus
from backend.app.services.post_jobs import PostJobService


def _setup(db_session):
    org = Organization(name="Job Org")
    db_session.add(org)
    db_session.flush()
    loc = Location(name="Job Loc", organization_id=org.id, timezone="UTC")
    db_session.add(loc)
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

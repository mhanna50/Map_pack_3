from __future__ import annotations

from datetime import datetime, timezone

from backend.app.models.enums import OrganizationType, PostStatus, PostType
from backend.app.models.location import Location
from backend.app.models.organization import Organization
from backend.app.models.post_candidate import PostCandidate
from backend.app.models.post import Post
from backend.app.services.post_scheduler import PostSchedulerService


def _setup(db_session):
    org = Organization(name="Scheduler Org", org_type=OrganizationType.AGENCY)
    db_session.add(org)
    db_session.flush()
    location = Location(name="Scheduler Location", organization_id=org.id, timezone="UTC")
    db_session.add(location)
    candidate = PostCandidate(
        organization_id=org.id,
        location_id=location.id,
        candidate_date=datetime.now(timezone.utc).date(),
        bucket="service_spotlight",
        score=50,
        reason_json={},
        proposed_caption="Test caption",
    )
    db_session.add(candidate)
    db_session.commit()
    return org, location, candidate


def test_post_scheduler_assigns_window(db_session):
    org, location, candidate = _setup(db_session)
    service = PostSchedulerService(db_session)
    updated = service.schedule(candidate.id)
    assert updated.window_id is not None
    posts = db_session.query(Post).filter(Post.organization_id == org.id).count()
    assert posts == 1

from __future__ import annotations

from datetime import datetime, timezone

from backend.app.models.action import Action
from backend.app.models.enums import ActionType, OrganizationType, PostStatus, PostType
from backend.app.models.location import Location
from backend.app.models.organization import Organization
from backend.app.models.post import Post
from backend.app.services.actions import ActionExecutor


def _setup_post(db_session):
    org = Organization(name="GBP Actions Org", org_type=OrganizationType.AGENCY)
    db_session.add(org)
    db_session.flush()
    location = Location(name="GBP Actions Location", organization_id=org.id, timezone="UTC", google_location_id="locations/1")
    db_session.add(location)
    db_session.flush()
    post = Post(
        organization_id=org.id,
        location_id=location.id,
        body="Hello world",
        post_type=PostType.UPDATE,
        status=PostStatus.SCHEDULED,
    )
    db_session.add(post)
    db_session.commit()
    return org, location, post


def test_action_executor_publish_post_uses_gbp_service(db_session, monkeypatch):
    org, location, post = _setup_post(db_session)
    action = Action(
        organization_id=org.id,
        location_id=location.id,
        action_type=ActionType.PUBLISH_GBP_POST,
        status="pending",
        run_at=datetime.now(timezone.utc),
        payload={"post_id": str(post.id)},
    )
    db_session.add(action)
    db_session.commit()

    executor = ActionExecutor(db_session)

    called = {}

    class StubPublisher:
        def publish_post(self, p):
            called["post_id"] = p.id
            return {"name": "locations/1/localPosts/1"}

    executor.gbp_publisher = StubPublisher()

    result = executor._handle_publish_post(action)
    assert result["status"] == "published"
    assert called["post_id"] == post.id


def test_action_executor_sync_reviews(db_session, monkeypatch):
    org, location, _ = _setup_post(db_session)
    action = Action(
        organization_id=org.id,
        location_id=location.id,
        action_type=ActionType.SYNC_GBP_REVIEWS,
        status="pending",
        run_at=datetime.now(timezone.utc),
        payload={"location_id": str(location.id)},
    )
    db_session.add(action)
    db_session.commit()

    executor = ActionExecutor(db_session)

    class StubSync:
        def sync_reviews(self, org_id, loc_id):
            return 5

        def sync_posts(self, org_id, loc_id):
            return 0

    executor.gbp_sync = StubSync()

    result = executor._handle_sync_reviews(action)
    assert result == {"status": "reviews_synced", "count": 5}

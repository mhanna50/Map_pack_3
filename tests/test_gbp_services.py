from __future__ import annotations

import uuid

from backend.app.models.enums import OrganizationType, PostStatus, PostType, ReviewRating
from backend.app.models.google_business.location import Location
from backend.app.models.identity.organization import Organization
from backend.app.models.posts.post import Post
from backend.app.models.reviews.review import Review
from backend.app.services.google_business.gbp_publishing import GbpPublishingService
from backend.app.services.google_business.gbp_sync import GbpSyncService


class _FakeClient:
    def __init__(self) -> None:
        self.published = []

    def create_local_post(self, location_name: str, payload):
        self.published.append((location_name, payload))
        return {"name": f"{location_name}/posts/1"}

    def list_reviews(self, location_name: str):
        return [
            {
                "name": f"{location_name}/reviews/1",
                "comment": "Great service",
                "starRating": "FIVE",
                "reviewer": {"displayName": "Pat"},
            }
        ]

    def list_local_posts(self, location_name: str):
        return [
            {
                "name": f"{location_name}/localPosts/1",
                "summary": "Synced post",
            }
        ]

    def reply_to_review(self, review_name: str, comment: str):
        return {"name": review_name, "comment": comment}


def test_gbp_publishing_service(db_session):
    org = Organization(name="GBP Org", org_type=OrganizationType.AGENCY)
    db_session.add(org)
    db_session.flush()
    location = Location(name="HQ", organization_id=org.id, timezone="UTC", google_location_id="locations/123")
    db_session.add(location)
    db_session.flush()
    post = Post(
        organization_id=org.id,
        location_id=location.id,
        body="Hello",
        post_type=PostType.UPDATE,
        status=PostStatus.SCHEDULED,
    )
    db_session.add(post)
    db_session.commit()

    service = GbpPublishingService(db_session)
    fake_client = _FakeClient()
    service._client = lambda org_id: fake_client  # type: ignore[method-assign]

    result = service.publish_post(post)
    assert result["name"].endswith("/posts/1")
    db_session.refresh(post)
    assert post.publish_result["name"].endswith("/posts/1")


def test_gbp_publish_post_is_idempotent_after_success(db_session):
    org = Organization(name="GBP Idempotent Org", org_type=OrganizationType.AGENCY)
    db_session.add(org)
    db_session.flush()
    location = Location(name="HQ", organization_id=org.id, timezone="UTC", google_location_id="locations/123")
    db_session.add(location)
    db_session.flush()
    post = Post(
        organization_id=org.id,
        location_id=location.id,
        body="This is a real caption for idempotency testing. Contact us today to schedule a consultation.",
        post_type=PostType.UPDATE,
        status=PostStatus.SCHEDULED,
    )
    db_session.add(post)
    db_session.commit()

    service = GbpPublishingService(db_session)
    fake_client = _FakeClient()
    service._client = lambda org_id: fake_client  # type: ignore[method-assign]

    first = service.publish_post(post)
    second = service.publish_post(post)

    assert first["name"].endswith("/posts/1")
    assert second["name"].endswith("/posts/1")
    assert len(fake_client.published) == 1


def test_gbp_sync_service(db_session):
    org = Organization(name="Sync Org", org_type=OrganizationType.AGENCY)
    db_session.add(org)
    db_session.flush()
    location = Location(name="Sync HQ", organization_id=org.id, timezone="UTC", google_location_id="locations/abc")
    db_session.add(location)
    db_session.commit()

    service = GbpSyncService(db_session)
    fake_client = _FakeClient()
    service._client = lambda org_id: fake_client  # type: ignore[method-assign]

    review_count = service.sync_reviews(org.id, location.id)
    assert review_count == 1
    post_count = service.sync_posts(org.id, location.id)
    assert post_count == 1

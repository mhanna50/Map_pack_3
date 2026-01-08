from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from backend.app.models.approval_request import ApprovalRequest
from backend.app.models.enums import OrganizationType, PostStatus, PostType
from backend.app.models.location import Location
from backend.app.models.organization import Organization
from backend.app.services.posts import PostService


class StubActionService:
    def __init__(self) -> None:
        self.actions = []

    def schedule_action(self, **payload):
        self.actions.append(payload)
        return payload


def _setup_location(db_session) -> tuple[Organization, Location]:
    org = Organization(name="Post Safety Org", org_type=OrganizationType.AGENCY)
    db_session.add(org)
    db_session.flush()
    location = Location(name="Safety Location", organization_id=org.id, timezone="UTC")
    db_session.add(location)
    db_session.commit()
    return org, location


def _service(db_session) -> PostService:
    return PostService(db_session, action_service=StubActionService())


def test_max_posts_per_week_enforced(db_session):
    org, location = _setup_location(db_session)
    service = _service(db_session)
    base_time = datetime.now(timezone.utc)
    for offset in (0, 3, 5):
        service.create_post(
            organization_id=org.id,
            location_id=location.id,
            connected_account_id=None,
            post_type=PostType.UPDATE,
            base_prompt=f"Update #{offset}",
            scheduled_at=base_time + timedelta(days=offset),
            context={},
            bucket=f"bucket-{offset}",
        )
    with pytest.raises(ValueError):
        service.create_post(
            organization_id=org.id,
            location_id=location.id,
            connected_account_id=None,
            post_type=PostType.UPDATE,
            base_prompt="Fourth post",
            scheduled_at=base_time + timedelta(days=6),
            context={},
            bucket="bucket-4",
        )


def test_bucket_cooldown_enforced(db_session):
    org, location = _setup_location(db_session)
    service = _service(db_session)
    now = datetime.now(timezone.utc)
    service.create_post(
        organization_id=org.id,
        location_id=location.id,
        connected_account_id=None,
        post_type=PostType.UPDATE,
        base_prompt="Promo post",
        scheduled_at=now,
        context={},
        bucket="promo",
    )
    with pytest.raises(ValueError):
        service.create_post(
            organization_id=org.id,
            location_id=location.id,
            connected_account_id=None,
            post_type=PostType.UPDATE,
            base_prompt="Another promo",
            scheduled_at=now + timedelta(days=2),
            context={},
            bucket="promo",
        )


def test_pricing_language_requires_approval(db_session):
    org, location = _setup_location(db_session)
    service = _service(db_session)
    post = service.create_post(
        organization_id=org.id,
        location_id=location.id,
        connected_account_id=None,
        post_type=PostType.UPDATE,
        base_prompt="Save 20% on HVAC installs this week!",
        scheduled_at=datetime.now(timezone.utc),
        context={},
        bucket="promo",
    )
    assert post.status == PostStatus.DRAFT
    approvals = db_session.query(ApprovalRequest).filter(ApprovalRequest.payload["post_id"].astext == str(post.id)).count()
    assert approvals == 1


def test_org_pause_blocks_post_creation(db_session):
    org, location = _setup_location(db_session)
    org.posting_paused = True
    db_session.add(org)
    db_session.commit()
    service = _service(db_session)
    with pytest.raises(ValueError):
        service.create_post(
            organization_id=org.id,
            location_id=location.id,
            connected_account_id=None,
            post_type=PostType.UPDATE,
            base_prompt="Should not post",
            scheduled_at=datetime.now(timezone.utc),
            context={},
            bucket="general",
        )


def test_location_cap_override_enforced(db_session):
    org, location = _setup_location(db_session)
    location.posting_cap_per_week = 1
    db_session.add(location)
    db_session.commit()
    service = _service(db_session)
    now = datetime.now(timezone.utc)
    service.create_post(
        organization_id=org.id,
        location_id=location.id,
        connected_account_id=None,
        post_type=PostType.UPDATE,
        base_prompt="First",
        scheduled_at=now,
        context={},
        bucket="general",
    )
    with pytest.raises(ValueError):
        service.create_post(
            organization_id=org.id,
            location_id=location.id,
            connected_account_id=None,
            post_type=PostType.UPDATE,
            base_prompt="Second",
            scheduled_at=now + timedelta(days=1),
            context={},
            bucket="general",
        )

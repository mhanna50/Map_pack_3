from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import text

from backend.app.models.enums import PostStatus, PostType, OrganizationType
from backend.app.models.media_asset import MediaAsset
from backend.app.models.organization import Organization
from backend.app.models.location import Location
from backend.app.services.posts import PostService


def _create_org_and_location(db_session):
    org = Organization(name="Posting Org", org_type=OrganizationType.AGENCY)
    db_session.add(org)
    db_session.flush()
    location = Location(
        organization_id=org.id,
        name="Test Location",
        timezone="UTC",
    )
    db_session.add(location)
    db_session.commit()
    return org, location


def test_create_post_via_service_schedules_action(db_session):
    org, location = _create_org_and_location(db_session)
    service = PostService(db_session)
    scheduled_at = datetime.now(timezone.utc) + timedelta(hours=2)
    post = service.create_post(
        organization_id=org.id,
        location_id=location.id,
        connected_account_id=None,
        post_type=PostType.UPDATE,
        base_prompt="Grand opening week special!",
        scheduled_at=scheduled_at,
        context={"theme": "grand-opening"},
        brand_voice={"tone": "energetic"},
        services=["Heating", "Cooling"],
        keywords=["HVAC"],
        locations=["Austin"],
        variants=3,
    )
    assert post.status == PostStatus.SCHEDULED
    assert len(post.variants) == 3
    action = db_session.execute(
        text("SELECT payload FROM actions WHERE payload ->> 'post_id' = :pid"),
        {"pid": str(post.id)},
    ).first()
    assert action is not None


def test_post_api_create_and_attachment(api_client, db_session):
    org, location = _create_org_and_location(db_session)
    media = MediaAsset(
        organization_id=org.id,
        location_id=location.id,
        file_name="hero.jpg",
        media_type="image",
        storage_url="https://example.com/hero.jpg",
    )
    db_session.add(media)
    db_session.commit()
    payload = {
        "organization_id": str(org.id),
        "location_id": str(location.id),
        "post_type": "offer",
        "base_prompt": "Save 20% this month!",
        "services": ["Tune-up"],
        "keywords": ["efficiency"],
        "cities": ["Denver"],
        "scheduled_at": datetime.now(timezone.utc).isoformat(),
    }
    response = api_client.post("/api/posts/", json=payload)
    assert response.status_code == 201
    post = response.json()
    assert post["post_type"] == "offer"
    post_id = post["id"]

    attach_resp = api_client.post(
        f"/api/posts/{post_id}/attachments", json={"media_asset_id": str(media.id)}
    )
    assert attach_resp.status_code == 200
    updated = attach_resp.json()
    assert updated["id"] == post_id

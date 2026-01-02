from __future__ import annotations

from datetime import datetime, timedelta, timezone

from backend.app.models.action import Action
from backend.app.models.enums import (
    MediaStatus,
    MediaType,
    OrganizationType,
    PendingChangeStatus,
)
from backend.app.models.location import Location
from backend.app.models.organization import Organization
from backend.app.services.media_management import MediaManagementService


def _setup_org_and_location(db_session):
    org = Organization(name="Media Org", org_type=OrganizationType.AGENCY)
    db_session.add(org)
    db_session.flush()
    location = Location(
        name="Media Location",
        organization_id=org.id,
        timezone="UTC",
    )
    db_session.add(location)
    db_session.commit()
    return org, location


def test_request_upload_if_stale_creates_action(db_session):
    org, location = _setup_org_and_location(db_session)
    service = MediaManagementService(db_session)

    request = service.request_upload_if_stale(
        organization_id=org.id,
        location_id=location.id,
        days_without_upload=14,
    )
    assert request is not None
    assert request.status == PendingChangeStatus.PENDING

    actions = db_session.query(Action).all()
    assert actions
    assert actions[0].payload["media_upload_request_id"] == str(request.id)

    duplicate = service.request_upload_if_stale(
        organization_id=org.id,
        location_id=location.id,
    )
    assert duplicate.id == request.id

    request.status = PendingChangeStatus.APPROVED
    db_session.add(request)
    db_session.commit()
    service.upload_media(
        organization_id=org.id,
        location_id=location.id,
        storage_url="s3://bucket/photo.jpg",
        file_name="photo.jpg",
        media_type=MediaType.IMAGE,
    )
    skipped = service.request_upload_if_stale(
        organization_id=org.id,
        location_id=location.id,
        days_without_upload=30,
    )
    assert skipped is None


def test_approve_media_completes_request(db_session):
    org, location = _setup_org_and_location(db_session)
    service = MediaManagementService(db_session)
    request = service.request_upload_if_stale(
        organization_id=org.id,
        location_id=location.id,
        days_without_upload=0,
    )
    asset = service.upload_media(
        organization_id=org.id,
        location_id=location.id,
        storage_url="s3://bucket/job.png",
        file_name="job.png",
        media_type=MediaType.IMAGE,
        upload_request_id=request.id,
    )
    approved = service.approve_media(asset)
    assert approved.status == MediaStatus.APPROVED
    db_session.refresh(request)
    assert request.status == PendingChangeStatus.APPROVED
    assert request.metadata_json["approved_asset_id"] == str(asset.id)


def test_media_selector_prefers_stale_assets(db_session):
    org, location = _setup_org_and_location(db_session)
    service = MediaManagementService(db_session)
    fresh = service.upload_media(
        organization_id=org.id,
        location_id=location.id,
        storage_url="s3://bucket/fresh.png",
        file_name="fresh.png",
        media_type=MediaType.IMAGE,
        categories=["general"],
    )
    stale = service.upload_media(
        organization_id=org.id,
        location_id=location.id,
        storage_url="s3://bucket/stale.png",
        file_name="stale.png",
        media_type=MediaType.IMAGE,
        categories=["general"],
    )
    now = datetime.now(timezone.utc)
    fresh.last_used_at = now
    stale.last_used_at = now - timedelta(days=45)
    db_session.add_all([fresh, stale])
    db_session.commit()

    chosen = service.next_media_for_posting(location_id=location.id, theme="general")
    assert chosen.id == stale.id
    assert chosen.last_used_at is not None


def test_mark_request_notified_records_timestamp(db_session):
    org, location = _setup_org_and_location(db_session)
    service = MediaManagementService(db_session)
    request = service.request_upload_if_stale(
        organization_id=org.id,
        location_id=location.id,
        days_without_upload=0,
    )
    updated = service.mark_request_notified(request)
    assert updated.notified_at is not None
    assert "last_notification" in updated.metadata_json

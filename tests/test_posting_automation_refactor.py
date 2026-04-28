from __future__ import annotations

from datetime import datetime, timedelta, timezone

from backend.app.models.content.brand_voice import BrandVoice
from backend.app.models.enums import MediaType, OrganizationType, PostStatus, PostType
from backend.app.models.google_business.location import Location
from backend.app.models.google_business.location_settings import LocationSettings
from backend.app.models.media.media_asset import MediaAsset
from backend.app.models.identity.organization import Organization
from backend.app.models.posts.post import Post
from backend.app.models.posts.post_candidate import PostCandidate
from backend.app.services.content.content_guardrails import ContentGuardrails
from backend.app.services.google_business.gbp_sync import GbpSyncService
from backend.app.services.media.media_management import MediaManagementService
from backend.app.services.media.media_selection import MediaSelector
from backend.app.services.posts.post_composition import PostCompositionService
from backend.app.services.posts.post_scheduler import PostSchedulerService


def _setup_org_location(
    db_session,
    *,
    services: list[str] | None = None,
    settings_json: dict | None = None,
    tone: str | None = None,
    google_location_id: str | None = None,
):
    org = Organization(name="Automation Org", org_type=OrganizationType.AGENCY)
    db_session.add(org)
    db_session.flush()
    location = Location(
        organization_id=org.id,
        name="Automation Location",
        timezone="UTC",
        google_location_id=google_location_id,
        address={"city": "Media", "state": "PA", "category": "Roofing Contractor"},
    )
    db_session.add(location)
    db_session.flush()
    loc_settings = LocationSettings(
        location_id=location.id,
        services=services or ["Roof Repair", "Roof Replacement"],
        keywords=["roofing", "inspection"],
        settings_json=settings_json or {},
    )
    db_session.add(loc_settings)
    if tone:
        db_session.add(BrandVoice(organization_id=org.id, tone=tone))
    db_session.commit()
    return org, location


def _candidate(db_session, org: Organization, location: Location, *, bucket: str, reason_json: dict | None = None) -> PostCandidate:
    candidate = PostCandidate(
        organization_id=org.id,
        location_id=location.id,
        candidate_date=datetime.now(timezone.utc).date(),
        bucket=bucket,
        score=80,
        reason_json=reason_json or {},
    )
    db_session.add(candidate)
    db_session.commit()
    db_session.refresh(candidate)
    return candidate


def test_unified_library_contains_uploaded_and_gbp_assets(db_session):
    org, location = _setup_org_location(db_session, google_location_id="locations/abc")
    media_service = MediaManagementService(db_session)
    media_service.upload_media(
        organization_id=org.id,
        location_id=location.id,
        storage_url="s3://bucket/uploaded.jpg",
        file_name="uploaded.jpg",
        media_type=MediaType.IMAGE,
    )

    class FakeClient:
        def list_media(self, location_name: str):
            return [
                {
                    "name": f"{location_name}/media/1",
                    "googleUrl": "https://example.com/gbp1.jpg",
                    "mediaFormat": "PHOTO",
                }
            ]

    sync = GbpSyncService(db_session)
    sync._client = lambda org_id: FakeClient()  # type: ignore[method-assign]
    sync.sync_media(org.id, location.id)

    assets = db_session.query(MediaAsset).filter(MediaAsset.location_id == location.id).all()
    assert {asset.source for asset in assets} == {"upload", "gbp"}


def test_photo_source_metadata_is_tracked(db_session):
    org, location = _setup_org_location(db_session, google_location_id="locations/meta")
    uploaded = MediaManagementService(db_session).upload_media(
        organization_id=org.id,
        location_id=location.id,
        storage_url="s3://bucket/source.jpg",
        file_name="source.jpg",
        media_type=MediaType.IMAGE,
    )
    assert uploaded.source == "upload"
    assert uploaded.usage_count == 0

    class FakeClient:
        def list_media(self, location_name: str):
            return [
                {
                    "name": f"{location_name}/media/ext-9",
                    "googleUrl": "https://example.com/ext-9.jpg",
                    "mediaFormat": "PHOTO",
                }
            ]

    sync = GbpSyncService(db_session)
    sync._client = lambda org_id: FakeClient()  # type: ignore[method-assign]
    sync.sync_media(org.id, location.id)
    gbp_asset = (
        db_session.query(MediaAsset)
        .filter(MediaAsset.location_id == location.id, MediaAsset.source == "gbp")
        .one()
    )
    assert gbp_asset.source_external_id.endswith("/ext-9")


def test_media_selector_respects_minimum_reuse_gap(db_session):
    org, location = _setup_org_location(db_session)
    now = datetime.now(timezone.utc)
    recent = MediaAsset(
        organization_id=org.id,
        location_id=location.id,
        file_name="recent.jpg",
        media_type=MediaType.IMAGE,
        storage_url="https://example.com/recent.jpg",
        source="upload",
        categories=["roof", "repair"],
        last_used_at=now - timedelta(days=2),
        usage_count=4,
    )
    stale = MediaAsset(
        organization_id=org.id,
        location_id=location.id,
        file_name="stale.jpg",
        media_type=MediaType.IMAGE,
        storage_url="https://example.com/stale.jpg",
        source="upload",
        categories=["roof", "repair"],
        last_used_at=now - timedelta(days=20),
        usage_count=1,
    )
    db_session.add_all([recent, stale])
    db_session.commit()

    selector = MediaSelector(db_session, freshness_days=14)
    picked = selector.pick_asset(
        location_id=location.id,
        service="roof repair",
        min_reuse_gap_days=14,
        mark_used=False,
    )
    assert picked.id == stale.id


def test_media_selector_falls_back_to_general_photo_when_service_match_missing(db_session):
    org, location = _setup_org_location(db_session)
    general = MediaAsset(
        organization_id=org.id,
        location_id=location.id,
        file_name="crew.jpg",
        media_type=MediaType.IMAGE,
        storage_url="https://example.com/crew.jpg",
        source="upload",
        categories=["team", "business"],
    )
    db_session.add(general)
    db_session.commit()

    picked = MediaSelector(db_session).pick_asset(
        location_id=location.id,
        service="roof replacement",
        mark_used=False,
    )
    assert picked.id == general.id


def test_default_generation_uses_service_category_location_and_voice(db_session):
    org, location = _setup_org_location(db_session, tone="professional")
    candidate = _candidate(db_session, org, location, bucket="service_spotlight")
    composed = PostCompositionService(db_session).compose(candidate.id)
    assert composed.reason_json["post_type"] == "update"
    assert "Media, PA" in composed.proposed_caption
    assert "Professional update:" in composed.proposed_caption


def test_offer_bucket_degrades_to_update_without_verified_offer_data(db_session):
    org, location = _setup_org_location(db_session)
    candidate = _candidate(db_session, org, location, bucket="offer")
    composed = PostCompositionService(db_session).compose(candidate.id)
    assert composed.reason_json["post_type"] == "update"


def test_offer_post_only_when_verified_offer_exists(db_session):
    org, location = _setup_org_location(
        db_session,
        settings_json={
            "verified_offers": [
                {"title": "Spring Roof Check", "description": "Valid this month", "verified": True}
            ]
        },
    )
    candidate = _candidate(db_session, org, location, bucket="offer")
    composed = PostCompositionService(db_session).compose(candidate.id)
    assert composed.reason_json["post_type"] == "offer"


def test_event_post_only_when_verified_event_exists(db_session):
    org, location = _setup_org_location(
        db_session,
        settings_json={
            "verified_events": [
                {"title": "Community Cleanup", "description": "Saturday at 10 AM", "verified": True}
            ]
        },
    )
    candidate = _candidate(
        db_session,
        org,
        location,
        bucket="local_highlight",
        reason_json={"post_type_hint": "event"},
    )
    composed = PostCompositionService(db_session).compose(candidate.id)
    assert composed.reason_json["post_type"] == "event"


def test_generated_text_avoids_unverifiable_job_claims(db_session):
    org, location = _setup_org_location(db_session)
    candidate = _candidate(db_session, org, location, bucket="service_spotlight")
    composed = PostCompositionService(db_session).compose(candidate.id)
    lowered = composed.proposed_caption.lower()
    assert "just completed" not in lowered
    assert "yesterday" not in lowered


def test_generated_text_avoids_fabricated_offer_or_event_language(db_session):
    org, location = _setup_org_location(db_session)
    candidate = _candidate(db_session, org, location, bucket="offer")
    composed = PostCompositionService(db_session).compose(candidate.id)
    lowered = composed.proposed_caption.lower()
    assert "limited-time" not in lowered
    assert "discount" not in lowered
    assert "join us" not in lowered


def test_service_rotation_changes_selected_service_over_time(db_session):
    org, location = _setup_org_location(db_session, services=["Roof Repair", "Roof Replacement"])
    service_one = PostCompositionService(db_session).compose(
        _candidate(db_session, org, location, bucket="service_spotlight").id
    ).reason_json["service"]
    service_two = PostCompositionService(db_session).compose(
        _candidate(db_session, org, location, bucket="service_spotlight").id
    ).reason_json["service"]
    assert service_one != service_two


def test_brand_voice_changes_output_style(db_session):
    concise_org, concise_location = _setup_org_location(db_session, tone="concise")
    concise_candidate = _candidate(db_session, concise_org, concise_location, bucket="faq")
    concise = PostCompositionService(db_session).compose(concise_candidate.id).proposed_caption

    bold_org, bold_location = _setup_org_location(db_session, tone="bold")
    bold_candidate = _candidate(db_session, bold_org, bold_location, bucket="faq")
    bold = PostCompositionService(db_session).compose(bold_candidate.id).proposed_caption

    assert concise.startswith("Quick update:")
    assert bold.startswith("Ready for strong, dependable results?")
    assert concise != bold


def test_keyword_stuffing_guardrail_is_enforced():
    guardrails = ContentGuardrails()
    text = (
        "Roof repair in Media roof repair in Media roof repair in Media "
        "roof repair in Media roof repair in Media. Contact us now."
    )
    errors = guardrails.validate(
        text,
        post_type=PostType.UPDATE,
        service="roof repair",
        location="Media, PA",
        has_verified_offer=False,
        has_verified_event=False,
    )
    assert "keyword_stuffing" in errors


def test_generated_post_is_scheduled_and_persisted(db_session):
    org, location = _setup_org_location(db_session)
    candidate = PostCompositionService(db_session).compose(
        _candidate(db_session, org, location, bucket="service_spotlight").id
    )
    scheduled = PostSchedulerService(db_session).schedule(candidate.id)
    post = db_session.query(Post).filter(Post.location_id == location.id).one()
    assert scheduled.status == PostStatus.SCHEDULED
    assert post.scheduled_at is not None
    assert post.body == candidate.proposed_caption


def test_photo_usage_count_and_last_used_update_when_scheduled(db_session):
    org, location = _setup_org_location(db_session)
    asset = MediaAsset(
        organization_id=org.id,
        location_id=location.id,
        file_name="roof.jpg",
        media_type=MediaType.IMAGE,
        storage_url="https://example.com/roof.jpg",
        source="upload",
        categories=["roof", "repair"],
    )
    db_session.add(asset)
    db_session.commit()

    candidate = PostCompositionService(db_session).compose(
        _candidate(db_session, org, location, bucket="service_spotlight").id
    )
    assert candidate.media_asset_id == asset.id
    PostSchedulerService(db_session).schedule(candidate.id)
    db_session.refresh(asset)
    assert asset.usage_count == 1
    assert asset.last_used_at is not None


def test_automation_continues_with_limited_client_inputs(db_session):
    org, location = _setup_org_location(
        db_session,
        services=[],
        settings_json={},
        tone="friendly",
    )
    location.address = {"city": "Media", "state": "PA"}
    db_session.add(location)
    db_session.commit()

    candidate = _candidate(db_session, org, location, bucket="faq")
    composed = PostCompositionService(db_session).compose(candidate.id)
    assert composed.proposed_caption
    assert composed.media_asset_id is None
    scheduled = PostSchedulerService(db_session).schedule(composed.id)
    assert scheduled.status == PostStatus.SCHEDULED

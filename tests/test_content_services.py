from __future__ import annotations

from datetime import datetime, timedelta, timezone

from backend.app.models.enums import MediaType, OrganizationType
from backend.app.models.media_asset import MediaAsset
from backend.app.models.post_rotation_memory import PostRotationMemory
from backend.app.models.organization import Organization
from backend.app.models.location import Location
from backend.app.services.captions import CaptionGenerator
from backend.app.services.media_selection import MediaSelector
from backend.app.services.rotation import RotationEngine


def _org_location(db_session):
    org = Organization(name="Content Org", org_type=OrganizationType.AGENCY)
    db_session.add(org)
    db_session.flush()
    location = Location(organization_id=org.id, name="Content Location", timezone="UTC")
    db_session.add(location)
    db_session.commit()
    return org, location


def test_rotation_engine_respects_cooldown(db_session):
    org, location = _org_location(db_session)
    engine = RotationEngine(db_session, cooldown_hours=48)
    now = datetime.now(timezone.utc)
    recent = PostRotationMemory(
        organization_id=org.id,
        location_id=location.id,
        key="service",
        value="HVAC",
        last_used_at=now - timedelta(hours=1),
    )
    db_session.add(recent)
    db_session.commit()

    choice = engine.select_next(
        organization_id=org.id,
        location_id=location.id,
        key="service",
        candidates=["HVAC", "Plumbing", "Electrical"],
    )
    assert choice == "Plumbing"


def test_media_selector_prefers_unused_assets(db_session):
    org, location = _org_location(db_session)
    selector = MediaSelector(db_session, freshness_days=10)
    older = MediaAsset(
        organization_id=org.id,
        location_id=location.id,
        file_name="old.jpg",
        media_type=MediaType.IMAGE,
        storage_url="https://example.com/old.jpg",
        last_used_at=datetime.now(timezone.utc) - timedelta(days=5),
    )
    newer = MediaAsset(
        organization_id=org.id,
        location_id=location.id,
        file_name="new.jpg",
        media_type=MediaType.IMAGE,
        storage_url="https://example.com/new.jpg",
        categories=["promo"],
    )
    db_session.add_all([older, newer])
    db_session.commit()

    picked = selector.pick_asset(location_id=location.id, theme="promo")
    assert picked.id == newer.id
    assert picked.last_used_at is not None


def test_caption_generator_variants():
    generator = CaptionGenerator(brand_voice={"tone": "bold", "voice": "confident"})
    variants = generator.generate_variants(
        base_prompt="Summer tune-up specials!",
        services=["Cooling"],
        keywords=["efficiency"],
        locations=["Austin"],
        count=5,
    )
    assert len(variants) == 5
    assert all("body" in variant for variant in variants)
    assert all(
        variant["compliance_flags"]["length_ok"] is True for variant in variants
    )

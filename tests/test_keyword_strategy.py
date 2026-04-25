from __future__ import annotations

from backend.app.models.action import Action
from backend.app.models.enums import ActionType, LocationStatus, MembershipRole, OrganizationType
from backend.app.models.location import Location
from backend.app.models.location_settings import LocationSettings
from backend.app.models.membership import Membership
from backend.app.models.organization import Organization
from backend.app.models.user import User
from backend.app.models.selected_keyword import SelectedKeyword
from backend.app.models.geo_grid_scan import GeoGridScan
from backend.app.models.gbp_post_keyword_mapping import GbpPostKeywordMapping
from backend.app.services.keyword_strategy import KeywordCampaignService, KeywordCampaignSchedulerService


def _seed_location(db_session):
    user = User(email="keyword-strategy@example.com")
    db_session.add(user)
    org = Organization(
        name="Keyword Strategy Org",
        org_type=OrganizationType.AGENCY,
        metadata_json={"onboarding_status": "completed"},
    )
    db_session.add(org)
    db_session.flush()
    membership = Membership(user_id=user.id, organization_id=org.id, role=MembershipRole.OWNER)
    db_session.add(membership)
    location = Location(
        organization_id=org.id,
        name="Downtown HVAC",
        timezone="UTC",
        status=LocationStatus.ACTIVE,
        google_location_id="accounts/123/locations/456",
        address={
            "city": "Austin",
            "state": "TX",
            "primaryCategory": "HVAC contractor",
        },
        latitude=30.2672,
        longitude=-97.7431,
    )
    db_session.add(location)
    db_session.flush()
    settings = LocationSettings(
        location_id=location.id,
        services=["ac repair", "furnace replacement", "air duct cleaning"],
        settings_json={
            "service_area_cities": ["Round Rock", "Cedar Park"],
            "gbp_description": "Local HVAC team with same-day service.",
            "website_url": "https://example.com",
            "gbp_ready": True,
        },
    )
    db_session.add(settings)
    db_session.commit()
    return org, location


def test_keyword_campaign_cycle_generates_full_pipeline(db_session):
    org, location = _seed_location(db_session)
    service = KeywordCampaignService(db_session)

    cycle = service.run_cycle(
        organization_id=org.id,
        location_id=location.id,
        trigger_source="manual",
    )

    assert cycle.status == "completed"
    selected = (
        db_session.query(SelectedKeyword)
        .filter(SelectedKeyword.campaign_cycle_id == cycle.id)
        .order_by(SelectedKeyword.rank_order.asc())
        .all()
    )
    assert len(selected) == 10
    assert selected[0].rank_order == 1
    assert selected[-1].rank_order == 10

    scans = (
        db_session.query(GeoGridScan)
        .filter(GeoGridScan.campaign_cycle_id == cycle.id, GeoGridScan.scan_type == "baseline")
        .all()
    )
    assert len(scans) == 10
    assert all(scan.total_points > 0 for scan in scans)

    mappings = (
        db_session.query(GbpPostKeywordMapping)
        .filter(GbpPostKeywordMapping.campaign_cycle_id == cycle.id)
        .all()
    )
    assert len(mappings) >= 10
    assert all(mapping.target_keyword for mapping in mappings)

    followup_action = (
        db_session.query(Action)
        .filter(
            Action.organization_id == org.id,
            Action.location_id == location.id,
            Action.action_type == ActionType.RUN_KEYWORD_FOLLOWUP_SCAN,
        )
        .first()
    )
    assert followup_action is not None

    payload = service.build_dashboard_payload(organization_id=org.id, location_id=location.id, cycle_id=cycle.id)
    assert payload["has_data"] is True
    assert len(payload["keywords"]) == 10
    assert payload["geo_grid"]


def test_onboarding_scheduler_is_one_time(db_session):
    org, location = _seed_location(db_session)
    scheduler = KeywordCampaignSchedulerService(db_session)

    first = scheduler.schedule_onboarding_first_runs()
    second = scheduler.schedule_onboarding_first_runs()

    assert first == 1
    assert second == 0
    queued = (
        db_session.query(Action)
        .filter(
            Action.organization_id == org.id,
            Action.location_id == location.id,
            Action.action_type == ActionType.RUN_KEYWORD_CAMPAIGN,
        )
        .all()
    )
    assert len(queued) == 1

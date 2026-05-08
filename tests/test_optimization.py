from __future__ import annotations

from backend.app.models.google_business.attribute_template import AttributeTemplate
from backend.app.models.automation.action import Action
from backend.app.models.enums import ActionType, LocationStatus, MediaType, OrganizationType, QnaStatus
from backend.app.models.google_business.location_settings import LocationSettings
from backend.app.models.google_business.location import Location
from backend.app.models.identity.organization import Organization
from backend.app.models.google_business.service_template import ServiceTemplate
from backend.app.models.media.media_asset import MediaAsset
from backend.app.models.operations.alert import Alert
from backend.app.models.google_business.qna_entry import QnaEntry
from backend.app.models.rank_tracking.gbp_optimization_action import GbpOptimizationAction
from backend.app.services.google_business.listing_optimization import ListingOptimizationService


def _org_location(db_session):
    org = Organization(name="Opt Org", org_type=OrganizationType.AGENCY)
    db_session.add(org)
    db_session.flush()
    loc = Location(organization_id=org.id, name="Opt Location", timezone="UTC")
    db_session.add(loc)
    db_session.commit()
    return org, loc


def test_listing_optimization_service(db_session):
    org, loc = _org_location(db_session)
    service_tpl = ServiceTemplate(organization_id=None, category="hvac", name="Furnace Repair")
    attr_tpl = AttributeTemplate(
        organization_id=None, category="hvac", attribute="Wheelchair accessible"
    )
    db_session.add_all([service_tpl, attr_tpl])
    db_session.commit()
    service = ListingOptimizationService(db_session)
    audit = service.audit_listing(
        organization_id=org.id,
        location_id=loc.id,
        category="hvac",
        current_services=[],
        current_attributes=[],
        description="Short desc",
        photos_count=5,
        hours_status="ok",
    )
    result = service.auto_apply(audit)
    assert "Furnace Repair" in result["services"]
    assert len(result["pending"]) >= 1


def test_optimization_api(api_client, db_session):
    org, loc = _org_location(db_session)
    db_session.add(ServiceTemplate(organization_id=None, category="hvac", name="AC Tuneup"))
    db_session.add(AttributeTemplate(organization_id=None, category="hvac", attribute="Wi-Fi"))
    db_session.commit()
    payload = {
        "organization_id": str(org.id),
        "location_id": str(loc.id),
        "category": "hvac",
        "current_services": [],
        "current_attributes": [],
        "description": "basic",
        "photos_count": 2,
        "hours_status": "missing",
    }
    resp = api_client.post("/api/optimization/audit", json=payload)
    assert resp.status_code == 201
    data = resp.json()
    assert "AC Tuneup" in (data["missing_services"] or [])


def _active_gbp_location(db_session):
    org = Organization(name="GBP Audit Org", org_type=OrganizationType.AGENCY)
    db_session.add(org)
    db_session.flush()
    loc = Location(
        organization_id=org.id,
        name="Audit Location",
        timezone="UTC",
        status=LocationStatus.ACTIVE,
        google_location_id="locations/audit-1",
        address={"city": "Austin", "primaryCategory": "Plumber"},
    )
    db_session.add(loc)
    db_session.flush()
    settings = LocationSettings(
        location_id=loc.id,
        services=[{"name": "Drain Cleaning", "description": ""}],
        settings_json={"gbp_description": "Short"},
    )
    db_session.add(settings)
    db_session.add(
        MediaAsset(
            organization_id=org.id,
            location_id=loc.id,
            file_name="one.jpg",
            media_type=MediaType.IMAGE,
            storage_url="https://example.com/one.jpg",
            source="upload",
        )
    )
    db_session.commit()
    return org, loc


def test_gbp_full_audit_creates_items_alert_and_dashboard_payload(db_session):
    org, loc = _active_gbp_location(db_session)
    service = ListingOptimizationService(db_session)

    audit = service.run_full_audit(
        organization_id=org.id,
        location_id=loc.id,
        trigger_source="monthly",
    )
    payload = service.dashboard_payload(organization_id=org.id, location_id=loc.id)

    assert audit.profile_completeness_score < 100
    assert {item.field_name for item in audit.items} >= {
        "primary_category",
        "service_descriptions",
        "business_description",
        "phone",
        "photos",
        "qna_section",
    }
    assert any(item.user_action_required for item in audit.items)
    assert any(item.auto_fixable for item in audit.items)
    assert payload["popup"]["should_show"] is True
    assert payload["user_action_required_items"]
    assert payload["auto_fixable_items"]
    alert = db_session.query(Alert).filter(Alert.alert_type == "gbp_audit_complete").one()
    assert alert.metadata_json["audit_id"] == str(audit.id)


def test_gbp_audit_auto_fixes_are_pending_review_not_direct_profile_edits(db_session):
    org, loc = _active_gbp_location(db_session)
    service = ListingOptimizationService(db_session)
    audit = service.run_full_audit(organization_id=org.id, location_id=loc.id, trigger_source="manual")

    result = service.apply_auto_fixes(audit_id=audit.id)

    assert set(result["prepared"]) >= {"business_description", "service_descriptions", "qna_section"}
    actions = db_session.query(GbpOptimizationAction).filter(GbpOptimizationAction.location_id == loc.id).all()
    assert actions
    assert all(action.status == "pending_review" for action in actions)
    drafts = db_session.query(QnaEntry).filter(QnaEntry.location_id == loc.id).all()
    assert drafts
    assert all(qna.status == QnaStatus.DRAFT for qna in drafts)
    auto_items = [item for item in audit.items if item.auto_fixable]
    assert all(item.status == "pending_approval" for item in auto_items)
    assert all(item.before_value is not None and item.after_value for item in auto_items)


def test_gbp_monthly_scheduler_queues_location_audits(db_session):
    org, loc = _active_gbp_location(db_session)
    scheduled = ListingOptimizationService(db_session).schedule_monthly_audits()
    action = db_session.query(Action).filter(Action.action_type == ActionType.RUN_GBP_AUDIT).one()

    assert scheduled == 1
    assert action.organization_id == org.id
    assert action.location_id == loc.id
    assert action.payload["trigger_source"] == "monthly"


def test_gbp_audit_api_latest_and_status_update(api_client, db_session):
    org, loc = _active_gbp_location(db_session)
    run = api_client.post(
        "/api/optimization/gbp-audit/run",
        json={"organization_id": str(org.id), "location_id": str(loc.id), "trigger_source": "manual"},
    )
    assert run.status_code == 201
    latest = api_client.get(
        f"/api/optimization/gbp-audit/locations/{loc.id}/latest",
        params={"organization_id": str(org.id)},
    )
    assert latest.status_code == 200
    item_id = latest.json()["user_action_required_items"][0]["id"]
    patch = api_client.patch(
        f"/api/optimization/gbp-audit/items/{item_id}",
        json={"status": "dismissed", "notes": "handled externally"},
    )
    assert patch.status_code == 200
    assert patch.json()["status"] == "dismissed"

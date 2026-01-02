from __future__ import annotations

from backend.app.models.attribute_template import AttributeTemplate
from backend.app.models.enums import OrganizationType
from backend.app.models.location import Location
from backend.app.models.organization import Organization
from backend.app.models.service_template import ServiceTemplate
from backend.app.services.listing_optimization import ListingOptimizationService


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

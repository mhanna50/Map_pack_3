from __future__ import annotations

from backend.app.models.enums import OrganizationType
from backend.app.models.location import Location
from backend.app.models.location_settings import LocationSettings
from backend.app.models.organization import Organization
from backend.app.services.competitor_monitoring import CompetitorMonitoringService


def _create_location(db_session):
    org = Organization(name="API Compete", org_type=OrganizationType.AGENCY)
    db_session.add(org)
    db_session.flush()
    location = Location(name="API Compete Location", organization_id=org.id, timezone="UTC")
    db_session.add(location)
    db_session.flush()
    settings = LocationSettings(location_id=location.id, posting_schedule={"days": ["mon", "thu"]})
    db_session.add(settings)
    db_session.commit()
    return org, location


def test_competitor_api_flow(api_client, db_session):
    org, location = _create_location(db_session)
    manual_payload = {
        "organization_id": str(org.id),
        "competitors": [{"name": "Manual Rival", "category": "HVAC"}],
    }
    manual_response = api_client.post(
        f"/api/competitors/locations/{location.id}/manual", json=manual_payload
    )
    assert manual_response.status_code == 201
    assert manual_response.json()[0]["name"] == "Manual Rival"

    discover_payload = {"organization_id": str(org.id), "top_n": 2}
    discover_response = api_client.post(
        f"/api/competitors/locations/{location.id}/discover", json=discover_payload
    )
    assert discover_response.status_code == 201
    assert len(discover_response.json()) == 2

    list_response = api_client.get(f"/api/competitors/locations/{location.id}")
    assert list_response.status_code == 200
    assert len(list_response.json()) >= 3

    monitor_payload = {"organization_id": str(org.id)}
    monitor_response = api_client.post(
        f"/api/competitors/locations/{location.id}/monitor", json=monitor_payload
    )
    assert monitor_response.status_code == 202
    assert monitor_response.json()["status"] == "scheduled"

    # Run monitoring directly to populate snapshots for retrieval endpoint
    service = CompetitorMonitoringService(db_session)
    service.run_monitoring(organization_id=org.id, location_id=location.id)

    snapshot_response = api_client.get(f"/api/competitors/locations/{location.id}/snapshots")
    assert snapshot_response.status_code == 200
    snapshots = snapshot_response.json()
    assert snapshots
    assert "gap_flags" in snapshots[0]

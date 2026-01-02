from __future__ import annotations

from datetime import datetime, timezone

from backend.app.models.enums import OrganizationType
from backend.app.models.organization import Organization


def test_create_org_and_locations(api_client):
    payload = {"name": "Agency One", "org_type": OrganizationType.AGENCY.value, "slug": "agency-one"}
    response = api_client.post("/api/orgs/", json=payload)
    assert response.status_code == 201
    org = response.json()
    org_id = org["id"]
    assert org["name"] == payload["name"]

    loc_payload = {"name": "Main Location", "timezone": "UTC"}
    loc_response = api_client.post(f"/api/orgs/{org_id}/locations", json=loc_payload)
    assert loc_response.status_code == 201
    location = loc_response.json()
    assert location["name"] == loc_payload["name"]
    assert location["organization_id"] == org_id

    settings_payload = {
        "posting_schedule": {"days": ["mon", "wed"]},
        "voice_profile": {"tone": "friendly"},
        "approvals": {"required": True},
        "services": ["HVAC"],
        "keywords": ["repair"],
        "competitors": ["Other Co"],
    }
    settings_response = api_client.put(
        f"/api/orgs/locations/{location['id']}/settings",
        json=settings_payload,
    )
    assert settings_response.status_code == 200
    updated_location = settings_response.json()
    assert updated_location["id"] == location["id"]

    list_response = api_client.get(f"/api/orgs/{org_id}/locations")
    assert list_response.status_code == 200
    assert len(list_response.json()) == 1


def test_action_schedule_and_list(api_client, db_session):
    org = Organization(name="Scheduler Org", org_type=OrganizationType.AGENCY)
    db_session.add(org)
    db_session.commit()

    schedule_payload = {
        "organization_id": str(org.id),
        "action_type": "custom",
        "run_at": datetime.now(timezone.utc).isoformat(),
        "payload": {"kind": "demo"},
    }
    response = api_client.post("/api/actions/", json=schedule_payload)
    assert response.status_code == 201
    action = response.json()
    assert action["organization_id"] == str(org.id)
    assert action["payload"] == {"kind": "demo"}

    list_response = api_client.get(f"/api/actions?organization_id={org.id}")
    assert list_response.status_code == 200
    actions = list_response.json()
    assert len(actions) == 1
    assert actions[0]["id"] == action["id"]

from __future__ import annotations

from backend.app.models.enums import (
    AutomationActionType,
    AutomationCondition,
    AutomationTriggerType,
    OrganizationType,
)
from backend.app.models.location import Location
from backend.app.models.organization import Organization


def _setup(db_session):
    org = Organization(name="Automation API Org", org_type=OrganizationType.AGENCY)
    db_session.add(org)
    db_session.flush()
    location = Location(name="Automation API Location", organization_id=org.id, timezone="UTC")
    db_session.add(location)
    db_session.commit()
    return org, location


def test_create_simulate_and_run_rule(api_client, db_session):
    org, location = _setup(db_session)
    payload = {
        "organization_id": str(org.id),
        "location_id": str(location.id),
        "name": "No posts",
        "trigger_type": AutomationTriggerType.INACTIVITY.value,
        "condition": AutomationCondition.ALWAYS.value,
        "action_type": AutomationActionType.CREATE_POST.value,
        "config": {"days": 7},
    }
    create_resp = api_client.post("/api/automation/rules", json=payload)
    assert create_resp.status_code == 201
    rule = create_resp.json()

    list_resp = api_client.get(f"/api/automation/rules?organization_id={org.id}")
    assert list_resp.status_code == 200
    assert len(list_resp.json()) == 1

    simulate_resp = api_client.post(
        f"/api/automation/rules/{rule['id']}/simulate",
        params={"days": 15},
    )
    assert simulate_resp.status_code == 200
    assert "Would trigger" in simulate_resp.json()["summary"]

    run_resp = api_client.post(
        "/api/automation/rules/run",
        json={"organization_id": str(org.id), "location_id": str(location.id)},
    )
    assert run_resp.status_code == 200
    assert run_resp.json()["scheduled"] is False

    schedule_resp = api_client.post(
        "/api/automation/rules/run",
        json={
            "organization_id": str(org.id),
            "location_id": str(location.id),
            "schedule": True,
        },
    )
    assert schedule_resp.status_code == 200
    assert schedule_resp.json()["scheduled"] is True

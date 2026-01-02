from __future__ import annotations

from backend.app.models.enums import ApprovalCategory, ApprovalStatus, OrganizationType
from backend.app.models.location import Location
from backend.app.models.organization import Organization


def _setup(db_session):
    org = Organization(name="Approval API Org", org_type=OrganizationType.AGENCY)
    db_session.add(org)
    db_session.flush()
    location = Location(name="Approval API Location", organization_id=org.id, timezone="UTC")
    db_session.add(location)
    db_session.commit()
    return org, location


def test_approval_api_flow(api_client, db_session):
    org, location = _setup(db_session)
    create_payload = {
        "organization_id": str(org.id),
        "location_id": str(location.id),
        "category": ApprovalCategory.GBP_EDIT.value,
        "reason": "Edit name",
        "payload": {"field": "name"},
    }
    create_resp = api_client.post("/api/approvals/", json=create_payload)
    assert create_resp.status_code == 201
    approval = create_resp.json()

    list_resp = api_client.get(f"/api/approvals/?organization_id={org.id}")
    assert list_resp.status_code == 200
    assert len(list_resp.json()) == 1

    approve_resp = api_client.post(
        f"/api/approvals/{approval['id']}/approve",
        json={"notes": "ok"},
    )
    assert approve_resp.status_code == 200
    assert approve_resp.json()["status"] == ApprovalStatus.APPROVED.value

    rollback_resp = api_client.post(
        f"/api/approvals/{approval['id']}/rollback",
        json={"notes": "undo"},
    )
    assert rollback_resp.status_code == 200
    assert rollback_resp.json()["status"] == ApprovalStatus.ROLLED_BACK.value

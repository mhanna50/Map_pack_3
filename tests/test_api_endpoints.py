from __future__ import annotations

from datetime import datetime, timezone
import uuid

from backend.app.models.enums import MembershipRole, OrganizationType
from backend.app.models.identity.membership import Membership
from backend.app.models.identity.organization import Organization
from backend.app.models.identity.user import User


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


def test_non_staff_can_create_org_and_is_owner(api_client, db_session):
    user = User(email="client@example.com", is_staff=False)
    db_session.add(user)
    db_session.commit()

    payload = {"name": "Client Org", "org_type": OrganizationType.BUSINESS.value, "slug": "client-org"}
    response = api_client.post("/api/orgs/", params={"user_id": str(user.id)}, json=payload)
    assert response.status_code == 201
    org = response.json()

    org_id = uuid.UUID(org["id"])
    membership = (
        db_session.query(Membership)
        .filter(Membership.user_id == user.id, Membership.organization_id == org_id)
        .one_or_none()
    )
    assert membership is not None
    assert membership.role == MembershipRole.OWNER

    loc_payload = {"name": "Client HQ", "timezone": "UTC"}
    loc_response = api_client.post(
        f"/api/orgs/{org['id']}/locations",
        params={"user_id": str(user.id)},
        json=loc_payload,
    )
    assert loc_response.status_code == 201


def test_client_can_create_and_list_own_support_tickets(api_client, db_session):
    org = Organization(name="Support Org", org_type=OrganizationType.BUSINESS)
    user = User(email="support-client@example.com", is_staff=False)
    db_session.add_all([org, user])
    db_session.flush()
    db_session.add(Membership(user_id=user.id, organization_id=org.id, role=MembershipRole.OWNER))
    db_session.commit()

    create_response = api_client.post(
        "/api/support/tickets",
        params={"user_id": str(user.id)},
        json={
            "organization_id": str(org.id),
            "subject": "Need help with reviews",
            "description": "The review request screen is not updating.",
        },
    )
    assert create_response.status_code == 201
    ticket = create_response.json()
    assert ticket["tenant_id"] == str(org.id)
    assert ticket["status"] == "open"

    list_response = api_client.get(
        f"/api/support/tickets?organization_id={org.id}&user_id={user.id}",
    )
    assert list_response.status_code == 200
    assert [row["id"] for row in list_response.json()] == [ticket["id"]]


def test_client_cannot_create_support_ticket_for_other_tenant(api_client, db_session):
    org_a = Organization(name="Support Org A", org_type=OrganizationType.BUSINESS)
    org_b = Organization(name="Support Org B", org_type=OrganizationType.BUSINESS)
    user = User(email="support-client-b@example.com", is_staff=False)
    db_session.add_all([org_a, org_b, user])
    db_session.flush()
    db_session.add(Membership(user_id=user.id, organization_id=org_a.id, role=MembershipRole.OWNER))
    db_session.commit()

    response = api_client.post(
        "/api/support/tickets",
        params={"user_id": str(user.id)},
        json={
            "organization_id": str(org_b.id),
            "subject": "Wrong tenant",
            "description": "Should not be allowed.",
        },
    )
    assert response.status_code == 403


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

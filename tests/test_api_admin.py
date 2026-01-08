from __future__ import annotations

import uuid

from backend.app.models.enums import MembershipRole, OrganizationType
from backend.app.models.location import Location
from backend.app.models.membership import Membership
from backend.app.models.organization import Organization
from backend.app.models.user import User
from backend.app.services.passwords import PasswordService


def _create_staff_user(db_session) -> User:
    staff = User(email="admin@example.com", is_staff=True)
    db_session.add(staff)
    db_session.commit()
    return staff


def test_admin_create_and_list_orgs(api_client, db_session):
    staff = _create_staff_user(db_session)

    response = api_client.post(
        "/api/admin/orgs",
        params={"user_id": str(staff.id)},
        json={"name": "Client One", "plan_tier": "growth", "org_type": OrganizationType.BUSINESS.value},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Client One"
    assert data["plan_tier"] == "growth"
    assert data["needs_attention"] is False
    assert data["posting_paused"] is False

    list_response = api_client.get("/api/admin/orgs", params={"user_id": str(staff.id)})
    assert list_response.status_code == 200
    listed = list_response.json()
    assert len(listed) == 1
    assert listed[0]["name"] == "Client One"

    regular_user = User(email="member@example.com")
    db_session.add(regular_user)
    db_session.commit()
    forbidden = api_client.get("/api/admin/orgs", params={"user_id": str(regular_user.id)})
    assert forbidden.status_code == 403


def test_admin_org_detail_and_invites(api_client, db_session):
    staff = _create_staff_user(db_session)
    org = Organization(name="Detail Org", org_type=OrganizationType.AGENCY)
    db_session.add(org)
    db_session.flush()
    member = User(email="owner@example.com")
    db_session.add(member)
    db_session.flush()
    membership = Membership(user_id=member.id, organization_id=org.id, role=MembershipRole.OWNER)
    db_session.add(membership)
    db_session.commit()

    detail = api_client.get(
        f"/api/admin/orgs/{org.id}",
        params={"user_id": str(staff.id)},
    )
    assert detail.status_code == 200
    payload = detail.json()
    assert payload["name"] == org.name
    assert payload["members"][0]["email"] == "owner@example.com"
    assert payload["posting_paused"] is False

    invite_response = api_client.post(
        f"/api/admin/orgs/{org.id}/invites",
        params={"user_id": str(staff.id)},
        json={"email": "new-user@example.com", "role": MembershipRole.ADMIN.value},
    )
    assert invite_response.status_code == 201
    invite_body = invite_response.json()
    assert invite_body["email"] == "new-user@example.com"
    assert invite_body["token"]

    refreshed_detail = api_client.get(
        f"/api/admin/orgs/{org.id}",
        params={"user_id": str(staff.id)},
    )
    assert refreshed_detail.status_code == 200
    assert len(refreshed_detail.json()["invites"]) == 1


def test_accept_invite_flow(api_client, db_session):
    staff = _create_staff_user(db_session)
    org = Organization(name="Invite Org", org_type=OrganizationType.BUSINESS)
    db_session.add(org)
    db_session.commit()

    invite = api_client.post(
        f"/api/admin/orgs/{org.id}/invites",
        params={"user_id": str(staff.id)},
        json={"email": "invitee@example.com", "role": MembershipRole.MEMBER.value},
    )
    assert invite.status_code == 201
    token = invite.json()["token"]

    accept = api_client.post(
        "/api/auth/accept-invite",
        json={"token": token, "full_name": "Invited User", "password": "MapPack123!"},
    )
    assert accept.status_code == 200
    payload = accept.json()
    assert payload["organization_id"] == str(org.id)
    user_id = uuid.UUID(payload["user_id"])
    created_user = db_session.get(User, user_id)
    assert created_user.full_name == "Invited User"
    assert created_user.hashed_password
    password_service = PasswordService()
    assert password_service.verify_password("MapPack123!", created_user.hashed_password)

    duplicate = api_client.post(
        "/api/auth/accept-invite",
        json={"token": token, "full_name": "Invited User", "password": "MapPack123!"},
    )
    assert duplicate.status_code == 400


def test_admin_posting_controls(api_client, db_session):
    staff = _create_staff_user(db_session)
    org = Organization(name="Control Org", org_type=OrganizationType.BUSINESS)
    db_session.add(org)
    db_session.flush()
    location = Location(name="Control Loc", organization_id=org.id, timezone="UTC")
    db_session.add(location)
    db_session.commit()

    org_resp = api_client.patch(
        f"/api/admin/orgs/{org.id}/posting",
        params={"user_id": str(staff.id)},
        json={"paused": True, "cap_per_week": 2},
    )
    assert org_resp.status_code == 200
    payload = org_resp.json()
    assert payload["paused"] is True
    assert payload["cap_per_week"] == 2

    loc_resp = api_client.patch(
        f"/api/admin/orgs/{org.id}/locations/{location.id}/posting",
        params={"user_id": str(staff.id)},
        json={"paused": True, "cap_per_week": 1},
    )
    assert loc_resp.status_code == 200
    loc_payload = loc_resp.json()
    assert loc_payload["paused"] is True
    assert loc_payload["cap_per_week"] == 1

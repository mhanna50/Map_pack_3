from __future__ import annotations

from backend.app.models.enums import OrganizationType
from backend.app.models.organization import Organization
from backend.app.models.user import User


def _setup(db_session):
    staff = User(email="impersonator@example.com", is_staff=True)
    user = User(email="regular@example.com", is_staff=False)
    db_session.add_all([staff, user])
    org = Organization(name="Impersonation Org", org_type=OrganizationType.AGENCY)
    db_session.add(org)
    db_session.commit()
    return staff, user, org


def test_impersonation_session_creation(api_client, db_session):
    staff, user, org = _setup(db_session)
    response = api_client.post(
        f"/api/admin/orgs/{org.id}/impersonate",
        json={"user_id": str(staff.id), "reason": "support ticket"},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["token"]
    assert data["expires_at"]

    forbidden = api_client.post(
        f"/api/admin/orgs/{org.id}/impersonate",
        json={"user_id": str(user.id)},
    )
    assert forbidden.status_code == 403

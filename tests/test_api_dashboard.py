from __future__ import annotations

from backend.app.models.enums import MembershipRole, OrganizationType
from backend.app.models.location import Location
from backend.app.models.membership import Membership
from backend.app.models.organization import Organization
from backend.app.models.user import User


def test_dashboard_overview_endpoint(api_client, db_session):
    user = User(email="dash@example.com")
    db_session.add(user)
    org = Organization(name="Dash API Org", org_type=OrganizationType.AGENCY)
    db_session.add(org)
    db_session.flush()
    membership = Membership(user_id=user.id, organization_id=org.id, role=MembershipRole.OWNER)
    db_session.add(membership)
    location = Location(name="Dash Location", organization_id=org.id, timezone="UTC")
    db_session.add(location)
    db_session.commit()

    response = api_client.get(
        "/api/dashboard/overview",
        params={"user_id": str(user.id), "organization_id": str(org.id), "location_id": str(location.id)},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["organization"]["name"] == org.name
    assert data["location"]["name"] == location.name

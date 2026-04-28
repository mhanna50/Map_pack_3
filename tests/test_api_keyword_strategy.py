from __future__ import annotations

from backend.app.models.enums import LocationStatus, MembershipRole, OrganizationType
from backend.app.models.google_business.location import Location
from backend.app.models.google_business.location_settings import LocationSettings
from backend.app.models.identity.membership import Membership
from backend.app.models.identity.organization import Organization
from backend.app.models.identity.user import User


def _seed(api_client, db_session):
    user = User(email="api-keyword@example.com")
    db_session.add(user)
    org = Organization(
        name="API Keyword Org",
        org_type=OrganizationType.AGENCY,
        metadata_json={"onboarding_status": "completed"},
    )
    db_session.add(org)
    db_session.flush()
    db_session.add(Membership(user_id=user.id, organization_id=org.id, role=MembershipRole.OWNER))
    location = Location(
        organization_id=org.id,
        name="API Location",
        timezone="UTC",
        status=LocationStatus.ACTIVE,
        google_location_id="accounts/1/locations/2",
        address={"city": "Austin", "state": "TX", "primaryCategory": "Plumber"},
    )
    db_session.add(location)
    db_session.flush()
    db_session.add(
        LocationSettings(
            location_id=location.id,
            services=["water heater repair", "emergency plumber", "pipe replacement"],
            settings_json={"gbp_ready": True, "service_area_cities": ["Pflugerville"]},
        )
    )
    db_session.commit()
    return user, org, location


def test_keyword_strategy_run_and_dashboard_endpoint(api_client, db_session):
    user, org, location = _seed(api_client, db_session)

    run = api_client.post(
        "/api/keyword-strategy/run",
        json={
            "user_id": str(user.id),
            "organization_id": str(org.id),
            "location_id": str(location.id),
            "trigger_source": "manual",
        },
    )
    assert run.status_code == 202
    cycle_id = run.json()["cycle_id"]
    assert cycle_id

    dashboard = api_client.get(
        f"/api/keyword-strategy/locations/{location.id}/dashboard",
        params={
            "user_id": str(user.id),
            "organization_id": str(org.id),
            "cycle_id": cycle_id,
        },
    )
    assert dashboard.status_code == 200
    payload = dashboard.json()
    assert payload["has_data"] is True
    assert len(payload["keywords"]) == 10
    assert payload["cycle"]["id"] == cycle_id

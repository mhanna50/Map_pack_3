from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import text

from backend.app.models.enums import OrganizationType
from backend.app.models.location import Location
from backend.app.models.organization import Organization
from backend.app.services.rank_tracking import RankTrackingService


def _org_location(db_session):
    org = Organization(name="Rank Org", org_type=OrganizationType.AGENCY)
    db_session.add(org)
    db_session.flush()
    loc = Location(organization_id=org.id, name="Rank Location", timezone="UTC")
    db_session.add(loc)
    db_session.commit()
    return org, loc


def test_rank_service_add_keyword_and_grid_point(db_session):
    org, loc = _org_location(db_session)
    service = RankTrackingService(db_session)
    keyword = service.add_keyword(
        organization_id=org.id, location_id=loc.id, keyword="HVAC near me", importance=3
    )
    grid_point = service.add_grid_point(
        organization_id=org.id,
        location_id=loc.id,
        latitude=30.26,
        longitude=-97.74,
        radius_index=1,
    )
    run_at = datetime.now(timezone.utc) + timedelta(hours=1)
    service.schedule_rank_checks(
        organization_id=org.id,
        location_id=loc.id,
        keyword_ids=[keyword.id],
        grid_point_ids=[grid_point.id],
        run_at=run_at,
    )
    action = db_session.execute(
        text("SELECT payload FROM actions WHERE payload -> 'keyword_ids' IS NOT NULL")
    ).first()
    assert action is not None


def test_rank_api_endpoints(api_client, db_session):
    org, loc = _org_location(db_session)
    kw_resp = api_client.post(
        "/api/rankings/keywords",
        json={
            "organization_id": str(org.id),
            "location_id": str(loc.id),
            "keyword": "plumber",
            "importance": 2,
        },
    )
    assert kw_resp.status_code == 201
    keyword_id = kw_resp.json()["id"]
    gp_resp = api_client.post(
        "/api/rankings/grid-points",
        json={
            "organization_id": str(org.id),
            "location_id": str(loc.id),
            "latitude": 30.2,
            "longitude": -97.7,
        },
    )
    assert gp_resp.status_code == 201
    grid_point_id = gp_resp.json()["id"]
    sched_resp = api_client.post(
        "/api/rankings/schedule",
        json={
            "organization_id": str(org.id),
            "location_id": str(loc.id),
            "keyword_ids": [keyword_id],
            "grid_point_ids": [grid_point_id],
            "run_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    assert sched_resp.status_code == 202

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from backend.app.models.enums import OrganizationType, QnaStatus
from backend.app.models.location import Location
from backend.app.models.organization import Organization
from backend.app.services.qna import QnaService, QUESTION_LIBRARY


def _org_and_location(db_session):
    org = Organization(name="QnA Org", org_type=OrganizationType.AGENCY)
    db_session.add(org)
    db_session.flush()
    loc = Location(organization_id=org.id, name="QnA Location", timezone="UTC")
    db_session.add(loc)
    db_session.commit()
    return org, loc


def test_qna_service_generates_and_dedupes(db_session):
    org, loc = _org_and_location(db_session)
    service = QnaService(db_session)
    scheduled = datetime.now(timezone.utc) + timedelta(hours=1)
    qna = service.generate_qna(
        organization_id=org.id,
        location_id=loc.id,
        connected_account_id=None,
        categories=["default"],
        services=["Duct Cleaning"],
        cities=["Austin"],
        competitor_names=["OtherCo"],
        scheduled_at=scheduled,
    )
    assert qna.status == QnaStatus.SCHEDULED
    dup = service.generate_qna(
        organization_id=org.id,
        location_id=loc.id,
        connected_account_id=None,
        categories=["default"],
        services=["Duct Cleaning"],
        cities=["Austin"],
        competitor_names=["OtherCo"],
        scheduled_at=scheduled,
    )
    assert dup.id == qna.id


def test_qna_api_endpoints(api_client, db_session):
    org, loc = _org_and_location(db_session)
    payload = {
        "organization_id": str(org.id),
        "location_id": str(loc.id),
        "categories": ["default"],
        "services": ["Tuning"],
        "cities": ["Denver"],
        "scheduled_at": datetime.now(timezone.utc).isoformat(),
    }
    resp = api_client.post("/api/qna/", json=payload)
    assert resp.status_code == 201
    data = resp.json()
    qna_id = data["id"]

    list_resp = api_client.get(f"/api/qna/?organization_id={org.id}")
    assert list_resp.status_code == 200
    assert len(list_resp.json()) == 1

    update_resp = api_client.put(
        f"/api/qna/{qna_id}/status", json={"status": "archived"}
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["status"] == "archived"

from __future__ import annotations

from backend.app.models.enums import OrganizationType
from backend.app.models.organization import Organization
from backend.app.models.user import User
from backend.app.services.automation_settings import AUTOMATION_DEFINITIONS
from backend.app.services.jobs import JobService


def _setup(db_session):
    staff = User(email="auto-admin@example.com", is_staff=True)
    db_session.add(staff)
    org = Organization(name="Automation Org", org_type=OrganizationType.AGENCY)
    db_session.add(org)
    db_session.commit()
    return staff, org


def test_admin_automation_settings_and_run_now(api_client, db_session):
    staff, org = _setup(db_session)

    resp = api_client.get(
        f"/api/admin/orgs/{org.id}/automations",
        params={"user_id": str(staff.id)},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == len(AUTOMATION_DEFINITIONS)
    posts = next(item for item in data if item["type"] == "posts")
    assert posts["enabled"] is True

    patch = api_client.patch(
        f"/api/admin/orgs/{org.id}/automations",
        json={
            "user_id": str(staff.id),
            "automations": [
                {"type": "posts", "enabled": False, "config": {"cadence_days": 10}},
            ],
        },
    )
    assert patch.status_code == 200
    updated = next(item for item in patch.json() if item["type"] == "posts")
    assert updated["enabled"] is False
    assert updated["config"]["cadence_days"] == 10

    run_now = api_client.post(
        f"/api/admin/orgs/{org.id}/run-now",
        json={
            "user_id": str(staff.id),
            "type": "review_replies",
        },
    )
    assert run_now.status_code == 201
    body = run_now.json()
    assert body["job_type"] == AUTOMATION_DEFINITIONS["review_replies"]["job_type"]
    job = JobService(db_session).latest_runs(
        org.id, [AUTOMATION_DEFINITIONS["review_replies"]["job_type"]]
    )
    assert AUTOMATION_DEFINITIONS["review_replies"]["job_type"] in job

from __future__ import annotations

from backend.app.models.alert import Alert
from backend.app.models.enums import AlertSeverity, AlertStatus, OrganizationType
from backend.app.models.organization import Organization
from backend.app.models.user import User


def _setup(db_session):
    staff = User(email="alerts-admin@example.com", is_staff=True)
    db_session.add(staff)
    org = Organization(name="Alert Org", org_type=OrganizationType.AGENCY)
    db_session.add(org)
    alert = Alert(
        organization_id=org.id,
        severity=AlertSeverity.CRITICAL,
        alert_type="gbp_disconnected",
        message="GBP connection lost",
        status=AlertStatus.OPEN,
    )
    db_session.add(alert)
    db_session.commit()
    return staff, alert


def test_admin_alerts_flow(api_client, db_session):
    staff, alert = _setup(db_session)

    list_resp = api_client.get(
        "/api/admin/alerts",
        params={"user_id": str(staff.id), "status": AlertStatus.OPEN.value},
    )
    assert list_resp.status_code == 200
    assert list_resp.json()[0]["alert_type"] == "gbp_disconnected"

    ack_resp = api_client.patch(
        f"/api/admin/alerts/{alert.id}/ack",
        json={"user_id": str(staff.id), "notes": "Investigating"},
    )
    assert ack_resp.status_code == 200
    assert ack_resp.json()["status"] == AlertStatus.ACKNOWLEDGED.value

    notify_resp = api_client.post(
        f"/api/admin/alerts/{alert.id}/notify-client",
        json={"user_id": str(staff.id), "notes": "Client emailed"},
    )
    assert notify_resp.status_code == 200
    assert "Notified client" in notify_resp.json()["internal_notes"]

    resolve_resp = api_client.patch(
        f"/api/admin/alerts/{alert.id}/resolve",
        json={"user_id": str(staff.id), "notes": "Fixed"},
    )
    assert resolve_resp.status_code == 200
    assert resolve_resp.json()["status"] == AlertStatus.RESOLVED.value

from __future__ import annotations

from datetime import datetime, timezone, timedelta

from backend.app.models.enums import OrganizationType
from backend.app.models.organization import Organization
from backend.app.models.user import User
from backend.app.services.audit import log_audit


def _setup(db_session):
    staff = User(email="audit-admin@example.com", is_staff=True)
    db_session.add(staff)
    org = Organization(name="Audit Org", org_type=OrganizationType.AGENCY)
    db_session.add(org)
    db_session.commit()
    return staff, org


def test_admin_audit_listing(api_client, db_session):
    staff, org = _setup(db_session)
    log_audit(
        db_session,
        action="organization.created",
        actor=staff.id,
        org_id=org.id,
        entity="organization",
        entity_id=str(org.id),
        before={"name": "Old"},
        after={"name": org.name},
    )
    log_audit(
        db_session,
        action="location.updated",
        actor=None,
        org_id=org.id,
        entity="location",
        entity_id="loc-1",
        before={"name": "Before"},
        after={"name": "After"},
    )

    start = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
    resp = api_client.get(
        "/api/admin/audit",
        params={"user_id": str(staff.id), "organization_id": str(org.id), "start": start},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert len(body) >= 2
    actions = [entry["action"] for entry in body]
    assert "organization.created" in actions

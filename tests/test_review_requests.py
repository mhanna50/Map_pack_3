from __future__ import annotations

from backend.app.models.enums import OrganizationType
from backend.app.models.organization import Organization
from backend.app.services.review_requests import ReviewRequestService


def _setup(db_session):
    org = Organization(name="Review Org", org_type=OrganizationType.AGENCY)
    db_session.add(org)
    db_session.commit()
    return org


def test_review_request_email_delivery(db_session, monkeypatch):
    org = _setup(db_session)
    service = ReviewRequestService(db_session)

    contact = service.create_contact(
        organization_id=org.id,
        location_id=None,
        name="Customer",
        phone=None,
        email="customer@example.com",
    )
    job = service.create_job(
        organization_id=org.id,
        contact_id=contact.id,
        job_type="installation",
        status="completed",
    )

    emails: dict[str, str] = {}

    def fake_send_email(*, to_email, subject, html_body, **_):
        emails[to_email] = html_body

    monkeypatch.setattr(service.notifier, "send_email", fake_send_email)

    request = service.queue_review_request(
        organization_id=org.id,
        contact_id=contact.id,
        job_id=job.id,
        channel="email",
    )
    db_session.refresh(request)
    assert request.status.name == "SENT"
    assert "Please leave a review" in emails["customer@example.com"]

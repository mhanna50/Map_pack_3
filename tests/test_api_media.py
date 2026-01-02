from __future__ import annotations

from backend.app.models.enums import MediaType, OrganizationType
from backend.app.models.location import Location
from backend.app.models.organization import Organization
from backend.app.services.media_management import MediaManagementService


def _create_org_and_location(db_session):
    org = Organization(name="API Media Org", org_type=OrganizationType.AGENCY)
    db_session.add(org)
    db_session.flush()
    location = Location(name="API Location", organization_id=org.id, timezone="UTC")
    db_session.add(location)
    db_session.commit()
    return org, location


def test_media_flow_endpoints(api_client, db_session):
    org, location = _create_org_and_location(db_session)

    album_payload = {
        "organization_id": str(org.id),
        "location_id": str(location.id),
        "name": "Jobs",
        "description": "Before and after",
        "tags": ["hvac", "summer"],
    }
    album_response = api_client.post("/api/media/albums", json=album_payload)
    assert album_response.status_code == 201
    album = album_response.json()

    request_payload = {
        "organization_id": str(org.id),
        "location_id": str(location.id),
        "days_without_upload": 0,
    }
    request_response = api_client.post("/api/media/requests", json=request_payload)
    assert request_response.status_code == 201
    request_body = request_response.json()
    assert request_body["created"] is True
    upload_request_id = request_body["request"]["id"]

    asset_payload = {
        "organization_id": str(org.id),
        "location_id": str(location.id),
        "storage_url": "s3://bucket/asset.png",
        "file_name": "asset.png",
        "media_type": MediaType.IMAGE.value,
        "categories": ["before_after"],
        "album_id": album["id"],
        "job_type": "installation",
        "season": "summer",
        "shot_stage": "after",
        "upload_request_id": upload_request_id,
    }
    asset_response = api_client.post("/api/media/assets", json=asset_payload)
    assert asset_response.status_code == 201
    asset = asset_response.json()
    assert asset["status"] == "pending"
    assert asset["auto_caption"]

    approve_response = api_client.post(f"/api/media/assets/{asset['id']}/approve", json={})
    assert approve_response.status_code == 200
    assert approve_response.json()["status"] == "approved"

    assets_response = api_client.get(f"/api/media/assets?location_id={location.id}")
    assert assets_response.status_code == 200
    assets = assets_response.json()
    assert len(assets) == 1
    assert assets[0]["job_type"] == "installation"

    requests_response = api_client.get(f"/api/media/requests?location_id={location.id}")
    assert requests_response.status_code == 200
    request_items = requests_response.json()
    assert request_items[0]["status"] == "approved"


def test_media_request_endpoint_skips_when_recent(api_client, db_session):
    org, location = _create_org_and_location(db_session)
    service = MediaManagementService(db_session)
    service.upload_media(
        organization_id=org.id,
        location_id=location.id,
        storage_url="s3://bucket/latest.png",
        file_name="latest.png",
        media_type=MediaType.IMAGE,
    )
    payload = {
        "organization_id": str(org.id),
        "location_id": str(location.id),
        "days_without_upload": 30,
    }
    response = api_client.post("/api/media/requests", json=payload)
    assert response.status_code == 201
    assert response.json() == {"created": False, "request": None}

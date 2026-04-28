from __future__ import annotations

from datetime import datetime, timezone
import uuid

from backend.app.main import app as fastapi_app
from backend.app.models.automation.action import Action
from backend.app.models.automation.approval_request import ApprovalRequest
from backend.app.models.enums import (
    ActionType,
    ApprovalCategory,
    MediaType,
    MembershipRole,
    OrganizationType,
    PostType,
    QnaStatus,
)
from backend.app.models.identity.organization import Organization
from backend.app.models.google_business.location import Location
from backend.app.models.identity.user import User
from backend.app.models.identity.membership import Membership
from backend.app.models.google_business.qna_entry import QnaEntry
from backend.app.models.media.media_asset import MediaAsset
from backend.app.models.media.media_upload_request import MediaUploadRequest
from backend.app.models.posts.post import Post
from backend.app.api.deps import get_current_user


def _override_user(user: User):
    def _current_user():
        return user

    fastapi_app.dependency_overrides[get_current_user] = _current_user


def _reset_user_override():
    fastapi_app.dependency_overrides.pop(get_current_user, None)


def test_member_cannot_post_to_other_org(api_client, db_session):
    org1 = Organization(name="Org One", org_type=OrganizationType.AGENCY)
    org2 = Organization(name="Org Two", org_type=OrganizationType.AGENCY)
    db_session.add_all([org1, org2])
    db_session.commit()

    loc1 = Location(name="Loc1", organization_id=org1.id, timezone="UTC")
    loc2 = Location(name="Loc2", organization_id=org2.id, timezone="UTC")
    db_session.add_all([loc1, loc2])
    db_session.commit()

    user = User(email="member@example.com", is_staff=False)
    db_session.add(user)
    db_session.commit()
    membership = Membership(user_id=user.id, organization_id=org1.id, role=MembershipRole.MEMBER)
    db_session.add(membership)
    db_session.commit()

    _override_user(user)
    payload = {
        "organization_id": str(org2.id),
        "location_id": str(loc2.id),
        "base_prompt": "Hello",
        "post_type": PostType.UPDATE.value,
    }
    response = api_client.post("/api/posts/", json=payload)
    _reset_user_override()
    assert response.status_code == 403


def test_cross_org_ids_rejected_in_action_schedule(api_client, db_session):
    org1 = Organization(name="Org One", org_type=OrganizationType.AGENCY)
    org2 = Organization(name="Org Two", org_type=OrganizationType.AGENCY)
    db_session.add_all([org1, org2])
    db_session.commit()

    loc2 = Location(name="Loc2", organization_id=org2.id, timezone="UTC")
    db_session.add(loc2)
    db_session.commit()

    # staff user from fixture already active via api_client
    payload = {
        "organization_id": str(org1.id),
        "location_id": str(loc2.id),  # belongs to org2
        "action_type": ActionType.CUSTOM.value,
    }
    response = api_client.post("/api/actions/", json=payload)
    assert response.status_code == 400


def _two_org_member_fixture(db_session):
    org1 = Organization(name="Org One", org_type=OrganizationType.AGENCY)
    org2 = Organization(name="Org Two", org_type=OrganizationType.AGENCY)
    db_session.add_all([org1, org2])
    db_session.flush()
    loc1 = Location(name="Loc1", organization_id=org1.id, timezone="UTC")
    loc2 = Location(name="Loc2", organization_id=org2.id, timezone="UTC")
    user = User(email=f"member-{uuid.uuid4()}@example.com", is_staff=False)
    db_session.add_all([loc1, loc2, user])
    db_session.flush()
    db_session.add(Membership(user_id=user.id, organization_id=org1.id, role=MembershipRole.MEMBER))
    db_session.commit()
    return user, org1, org2, loc1, loc2


def test_unscoped_client_lists_only_member_org_rows(api_client, db_session):
    user, org1, org2, loc1, loc2 = _two_org_member_fixture(db_session)
    now = datetime.now(timezone.utc)
    action1 = Action(organization_id=org1.id, location_id=loc1.id, action_type=ActionType.CUSTOM, run_at=now)
    action2 = Action(organization_id=org2.id, location_id=loc2.id, action_type=ActionType.CUSTOM, run_at=now)
    post1 = Post(organization_id=org1.id, location_id=loc1.id, post_type=PostType.UPDATE, body="Post one")
    post2 = Post(organization_id=org2.id, location_id=loc2.id, post_type=PostType.UPDATE, body="Post two")
    qna1 = QnaEntry(organization_id=org1.id, location_id=loc1.id, question="Q1", answer="A1", status=QnaStatus.DRAFT)
    qna2 = QnaEntry(organization_id=org2.id, location_id=loc2.id, question="Q2", answer="A2", status=QnaStatus.DRAFT)
    approval1 = ApprovalRequest(
        organization_id=org1.id,
        location_id=loc1.id,
        category=ApprovalCategory.GBP_EDIT,
        reason="Approve one",
    )
    approval2 = ApprovalRequest(
        organization_id=org2.id,
        location_id=loc2.id,
        category=ApprovalCategory.GBP_EDIT,
        reason="Approve two",
    )
    asset1 = MediaAsset(
        organization_id=org1.id,
        location_id=loc1.id,
        file_name="one.png",
        storage_url="s3://bucket/one.png",
        media_type=MediaType.IMAGE,
    )
    asset2 = MediaAsset(
        organization_id=org2.id,
        location_id=loc2.id,
        file_name="two.png",
        storage_url="s3://bucket/two.png",
        media_type=MediaType.IMAGE,
    )
    upload1 = MediaUploadRequest(organization_id=org1.id, location_id=loc1.id, reason="Need photos", requested_at=now)
    upload2 = MediaUploadRequest(organization_id=org2.id, location_id=loc2.id, reason="Need photos", requested_at=now)
    db_session.add_all([action1, action2, post1, post2, qna1, qna2, approval1, approval2, asset1, asset2, upload1, upload2])
    db_session.commit()

    params = {"user_id": str(user.id)}
    scoped_endpoints = [
        ("/api/actions/", "organization_id", str(org1.id)),
        ("/api/posts/", "organization_id", str(org1.id)),
        ("/api/qna/", "organization_id", str(org1.id)),
        ("/api/approvals/", "organization_id", str(org1.id)),
        ("/api/media/assets", "organization_id", str(org1.id)),
        ("/api/media/requests", "id", str(upload1.id)),
    ]
    for path, key, expected_value in scoped_endpoints:
        response = api_client.get(path, params=params)
        assert response.status_code == 200, response.text
        rows = response.json()
        assert len(rows) == 1
        assert rows[0][key] == expected_value


def test_client_cannot_mutate_other_org_records_by_id(api_client, db_session):
    user, _, org2, _, loc2 = _two_org_member_fixture(db_session)
    post = Post(organization_id=org2.id, location_id=loc2.id, post_type=PostType.UPDATE, body="Other post")
    qna = QnaEntry(organization_id=org2.id, location_id=loc2.id, question="Other Q", answer="Other A")
    approval = ApprovalRequest(
        organization_id=org2.id,
        location_id=loc2.id,
        category=ApprovalCategory.GBP_EDIT,
        reason="Other approval",
    )
    asset = MediaAsset(
        organization_id=org2.id,
        location_id=loc2.id,
        file_name="other.png",
        storage_url="s3://bucket/other.png",
        media_type=MediaType.IMAGE,
    )
    db_session.add_all([post, qna, approval, asset])
    db_session.commit()

    params = {"user_id": str(user.id)}
    responses = [
        api_client.put(f"/api/posts/{post.id}/status", params=params, json={"status": "published"}),
        api_client.put(f"/api/qna/{qna.id}/status", params=params, json={"status": "archived"}),
        api_client.post(f"/api/approvals/{approval.id}/approve", params=params, json={"notes": "ok"}),
        api_client.post(f"/api/media/assets/{asset.id}/approve", params=params, json={}),
    ]
    assert [response.status_code for response in responses] == [403, 403, 403, 403]

from __future__ import annotations

import uuid

from backend.app.main import app as fastapi_app
from backend.app.models.enums import MembershipRole, OrganizationType, PostType, ActionType
from backend.app.models.organization import Organization
from backend.app.models.location import Location
from backend.app.models.user import User
from backend.app.models.membership import Membership
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

from __future__ import annotations

import uuid

from backend.app.api import deps
from backend.app.models.user import User


class _Verifier:
    def __init__(self, payload: dict[str, object]) -> None:
        self.payload = payload

    def verify(self, _: str) -> dict[str, object]:
        return self.payload


def _mock_supabase_token(monkeypatch, payload: dict[str, object]) -> None:
    monkeypatch.setattr(deps, "_get_verifier", lambda: _Verifier(payload))
    monkeypatch.setattr(deps, "_auth_user_exists", lambda db, user_id: True)


def test_get_current_user_creates_staff_from_app_metadata_role(db_session, monkeypatch):
    user_id = uuid.uuid4()
    _mock_supabase_token(
        monkeypatch,
        {
            "sub": str(user_id),
            "email": "admin@example.com",
            "app_metadata": {"role": "admin"},
        },
    )

    user = deps.get_current_user(authorization="Bearer test-token", db=db_session)

    assert user.id == user_id
    assert user.email == "admin@example.com"
    assert user.is_staff is True


def test_get_current_user_ignores_user_metadata_for_staff_escalation(db_session, monkeypatch):
    user_id = uuid.uuid4()
    _mock_supabase_token(
        monkeypatch,
        {
            "sub": str(user_id),
            "email": "client@example.com",
            "app_metadata": {},
            "user_metadata": {"is_staff": True, "role": "admin"},
        },
    )

    user = deps.get_current_user(authorization="Bearer test-token", db=db_session)

    assert user.id == user_id
    assert user.is_staff is False


def test_get_current_user_downgrades_staff_when_app_metadata_explicitly_false(db_session, monkeypatch):
    user_id = uuid.uuid4()
    existing = User(id=user_id, email="owner@example.com", is_staff=True)
    db_session.add(existing)
    db_session.commit()

    _mock_supabase_token(
        monkeypatch,
        {
            "sub": str(user_id),
            "email": "owner@example.com",
            "app_metadata": {"is_staff": False},
        },
    )

    user = deps.get_current_user(authorization="Bearer test-token", db=db_session)

    assert user.id == user_id
    assert user.is_staff is False

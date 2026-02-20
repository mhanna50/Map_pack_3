from __future__ import annotations

from collections.abc import Generator
from pathlib import Path
import sys
import uuid

import pytest
from fastapi.testclient import TestClient
from fastapi import Request
from sqlalchemy import create_engine
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import Session, sessionmaker

PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = PROJECT_ROOT / "backend"

for path in (PROJECT_ROOT, BACKEND_DIR):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

from backend.app.core.config import settings
from backend.app.db.base import Base
from backend.app.db.session import get_db
from backend.app.main import app as fastapi_app
from backend.app.models import *  # noqa: F401,F403
from backend.app.services.encryption import get_encryption_service
from backend.app.api.deps import get_current_user
from backend.app.models.user import User
from worker.app import tasks as worker_tasks

fernet_module = pytest.importorskip("cryptography.fernet")
Fernet = fernet_module.Fernet


@compiles(JSONB, "sqlite")
def _compile_jsonb_sqlite(element, compiler, **kw):
    return "JSON"


@pytest.fixture(scope="session")
def engine():
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        future=True,
    )
    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(autouse=True)
def encryption_key():
    key = Fernet.generate_key().decode()
    settings.ENCRYPTION_KEY = key
    get_encryption_service.cache_clear()
    try:
        yield
    finally:
        get_encryption_service.cache_clear()


@pytest.fixture
def db_session(engine) -> Generator[Session, None, None]:
    connection = engine.connect()
    transaction = connection.begin()
    TestingSessionLocal = sessionmaker(bind=connection, expire_on_commit=False)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture
def api_client(db_session):
    # default authenticated staff user for tests
    user = User(email="tester@example.com", is_staff=True)
    db_session.add(user)
    db_session.commit()

    def override_get_db() -> Generator[Session, None, None]:
        try:
            yield db_session
        finally:
            pass

    async def override_current_user(request: Request):
        # Allow tests to impersonate a specific user via ?user_id=<uuid> or JSON body user_id
        user_param = request.query_params.get("user_id")
        if not user_param and request.method in {"POST", "PUT", "PATCH"}:
            try:
                body = await request.json()
                user_param = body.get("user_id")
            except Exception:
                user_param = None
        if user_param:
            try:
                requested = db_session.get(User, uuid.UUID(str(user_param)))
                if requested:
                    return requested
            except Exception:
                pass
        return user

    fastapi_app.dependency_overrides[get_db] = override_get_db
    fastapi_app.dependency_overrides[get_current_user] = override_current_user
    with TestClient(fastapi_app) as client:
        yield client
    fastapi_app.dependency_overrides.pop(get_db, None)
    fastapi_app.dependency_overrides.pop(get_current_user, None)


@pytest.fixture
def worker_session_factory(engine, monkeypatch):
    TestingSessionLocal = sessionmaker(bind=engine, expire_on_commit=False)
    monkeypatch.setattr(worker_tasks, "SessionLocal", TestingSessionLocal)
    return TestingSessionLocal

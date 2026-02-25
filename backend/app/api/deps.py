from __future__ import annotations

from typing import Any
import uuid

import logging

from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.app.db.session import get_db
from backend.app.models.user import User
from backend.app.models.location import Location
from backend.app.services.access import AccessDeniedError, AccessService
from backend.app.services.supabase_auth import SupabaseTokenVerifier

_token_verifier: SupabaseTokenVerifier | None = None
logger = logging.getLogger("uvicorn.error")


def _get_verifier() -> SupabaseTokenVerifier:
    global _token_verifier
    if _token_verifier is None:
        _token_verifier = SupabaseTokenVerifier()
    return _token_verifier


def get_current_user(
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: Session = Depends(get_db),
) -> User:
    if not authorization or not authorization.lower().startswith("bearer "):
        logger.warning("Missing or invalid Authorization header on /auth/me")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    try:
        payload = _get_verifier().verify(token)
    except ValueError as exc:
        logger.exception("Supabase token verification failed (value error): %s", exc)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Supabase token verification failed (unauthorized): %s", exc)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc
    auth_user_id = _extract_user_id(payload)
    if not auth_user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token missing subject")
    if not _auth_user_exists(db, auth_user_id):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Auth user not found")

    email = _extract_email(payload)
    if not email:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token missing email")
    normalized_email = email.lower()
    full_name = _extract_name(payload)

    user = db.query(User).filter(User.id == auth_user_id).one_or_none()
    needs_commit = False

    if not user:
        legacy = db.query(User).filter(User.email == normalized_email).one_or_none()
        if legacy:
            if legacy.id != auth_user_id:
                _rekey_legacy_user_id(db, old_user_id=legacy.id, new_user_id=auth_user_id)
                legacy.id = auth_user_id
                needs_commit = True
            user = legacy
        else:
            user = User(id=auth_user_id, email=normalized_email, full_name=full_name)
            db.add(user)
            needs_commit = True

    if user.email != normalized_email:
        user.email = normalized_email
        needs_commit = True
    if full_name and not user.full_name:
        user.full_name = full_name
        needs_commit = True

    if needs_commit:
        db.commit()
        db.refresh(user)
    return user


def get_current_staff(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> User:
    access = AccessService(db)
    try:
        return access.require_staff(user.id)
    except AccessDeniedError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc


def require_org_member(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Ensure the authenticated user belongs to the organization inferred from the request.

    The org is derived from path/query params (organization_id) or a location_id that maps to an org.
    If no org context is present, the dependency is a no-op.
    """
    org_id = _extract_org_id(request, db)
    if not org_id:
        return None
    access = AccessService(db)
    try:
        access.resolve_org(user_id=current_user.id, organization_id=org_id)
    except AccessDeniedError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    _set_org_rls(db, org_id)
    return None


def _extract_org_id(request: Request, db: Session) -> Any:
    if "organization_id" in request.path_params:
        return _safe_uuid(request.path_params.get("organization_id"))
    if request.query_params.get("organization_id"):
        return _safe_uuid(request.query_params["organization_id"])
    location_ref = request.path_params.get("location_id") or request.query_params.get("location_id")
    if location_ref:
        location = db.get(Location, _safe_uuid(location_ref))
        if not location:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Location not found")
        return location.organization_id
    return None


def _safe_uuid(value: Any) -> Any:
    try:
        return uuid.UUID(str(value))
    except Exception:
        return None


def _extract_email(payload: dict[str, Any]) -> str | None:
    if payload.get("email"):
        return str(payload["email"])
    user_metadata = payload.get("user_metadata") or {}
    return user_metadata.get("email")


def _extract_name(payload: dict[str, Any]) -> str | None:
    user_metadata = payload.get("user_metadata") or {}
    return user_metadata.get("full_name") or user_metadata.get("name")


def _extract_user_id(payload: dict[str, Any]) -> uuid.UUID | None:
    raw_sub = payload.get("sub")
    if not raw_sub:
        return None
    try:
        return uuid.UUID(str(raw_sub))
    except Exception:
        return None


def _rekey_legacy_user_id(db: Session, old_user_id: uuid.UUID, new_user_id: uuid.UUID) -> None:
    # Some older environments stored public.users IDs independent of auth.users IDs.
    # memberships now reference auth.users, so we realign legacy rows by JWT subject.
    db.execute(
        text(
            "update organization_invites "
            "set invited_by_user_id = :new_user_id "
            "where invited_by_user_id = :old_user_id"
        ),
        {"new_user_id": str(new_user_id), "old_user_id": str(old_user_id)},
    )


def _auth_user_exists(db: Session, user_id: uuid.UUID) -> bool:
    result = db.execute(
        text("select 1 from auth.users where id = :user_id limit 1"),
        {"user_id": str(user_id)},
    ).first()
    return result is not None


def _set_org_rls(db: Session, org_id: uuid.UUID) -> None:
    """Set per-session org context for Postgres RLS."""
    try:
        if db.bind and db.bind.dialect.name == "postgresql":
            db.execute(text("SET LOCAL app.current_org = :org_id"), {"org_id": str(org_id)})
    except Exception:
        logger.exception("Failed to set RLS org context; continuing without it")

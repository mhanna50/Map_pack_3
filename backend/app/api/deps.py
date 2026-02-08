from __future__ import annotations

from typing import Any

import logging

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from backend.app.db.session import get_db
from backend.app.models.user import User
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
    email = _extract_email(payload)
    if not email:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token missing email")
    user = db.query(User).filter(User.email == email.lower()).one_or_none()
    if not user:
        user = User(email=email.lower(), full_name=_extract_name(payload))
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


def get_current_staff(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> User:
    access = AccessService(db)
    try:
        return access.require_staff(user.id)
    except AccessDeniedError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc


def _extract_email(payload: dict[str, Any]) -> str | None:
    if payload.get("email"):
        return str(payload["email"])
    user_metadata = payload.get("user_metadata") or {}
    return user_metadata.get("email")


def _extract_name(payload: dict[str, Any]) -> str | None:
    user_metadata = payload.get("user_metadata") or {}
    return user_metadata.get("full_name") or user_metadata.get("name")

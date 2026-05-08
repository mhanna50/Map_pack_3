from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any
import uuid

from sqlalchemy.orm import Session

from backend.app.models.impersonation_session import ImpersonationSession
from backend.app.services.audit import log_audit


class ImpersonationService:
    TOKEN_TTL_MINUTES = 15

    def __init__(self, db: Session) -> None:
        self.db = db

    def start_session(
        self,
        *,
        admin_user_id: uuid.UUID,
        organization_id: uuid.UUID,
        reason: str | None,
        ip_address: str | None,
    ) -> tuple[ImpersonationSession, str]:
        token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
        now = datetime.now(timezone.utc)
        session = ImpersonationSession(
            admin_user_id=admin_user_id,
            organization_id=organization_id,
            token_hash=token_hash,
            reason=reason,
            ip_address=ip_address,
            started_at=now,
            expires_at=now + timedelta(minutes=self.TOKEN_TTL_MINUTES),
        )
        self.db.add(session)
        self.db.commit()
        self.db.refresh(session)
        log_audit(
            self.db,
            action="impersonation.started",
            actor=admin_user_id,
            org_id=organization_id,
            entity="impersonation",
            entity_id=str(session.id),
            metadata={"reason": reason},
        )
        return session, token

    def end_session(self, session: ImpersonationSession, *, ended_by: uuid.UUID | None = None) -> ImpersonationSession:
        session.ended_at = datetime.now(timezone.utc)
        self.db.add(session)
        self.db.commit()
        self.db.refresh(session)
        log_audit(
            self.db,
            action="impersonation.ended",
            actor=ended_by,
            org_id=session.organization_id,
            entity="impersonation",
            entity_id=str(session.id),
        )
        return session

    def validate_token(self, token: str) -> ImpersonationSession | None:
        token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
        session = (
            self.db.query(ImpersonationSession)
            .filter(
                ImpersonationSession.token_hash == token_hash,
                ImpersonationSession.ended_at.is_(None),
            )
            .first()
        )
        if not session:
            return None
        if session.expires_at < datetime.now(timezone.utc):
            return None
        log_audit(
            self.db,
            action="impersonation.request",
            actor=session.admin_user_id,
            org_id=session.organization_id,
            entity="impersonation",
            entity_id=str(session.id),
        )
        return session

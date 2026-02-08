from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
import uuid

from sqlalchemy.orm import Session

from backend.app.core.config import settings
from backend.app.models.enums import MembershipRole
from backend.app.models.invite import OrganizationInvite
from backend.app.models.membership import Membership
from backend.app.models.organization import Organization
from backend.app.models.user import User
from backend.app.services.audit import log_audit
from backend.app.services.notifications import NotificationService
from backend.app.services.passwords import PasswordService


class InviteService:
    """Handles admin invites and acceptance flow."""

    def __init__(self, db: Session) -> None:
        self.db = db
        self.passwords = PasswordService()
        self.notifier = NotificationService()

    def create_invite(
        self,
        *,
        organization_id: uuid.UUID,
        email: str,
        role: MembershipRole,
        invited_by: uuid.UUID | None = None,
        expires_in_days: int = 14,
        send_email: bool = True,
    ) -> tuple[OrganizationInvite, str]:
        organization = self.db.get(Organization, organization_id)
        if not organization:
            raise ValueError("Organization not found")
        existing = (
            self.db.query(OrganizationInvite)
            .filter(OrganizationInvite.organization_id == organization_id)
            .filter(OrganizationInvite.email == email)
            .filter(OrganizationInvite.accepted_at.is_(None))
            .first()
        )
        if existing:
            self.db.delete(existing)
            self.db.flush()
        token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
        invite = OrganizationInvite(
            organization_id=organization_id,
            invited_by_user_id=invited_by,
            email=email.lower(),
            role=role,
            token_hash=token_hash,
            expires_at=datetime.now(timezone.utc) + timedelta(days=expires_in_days),
        )
        self.db.add(invite)
        self.db.commit()
        self.db.refresh(invite)
        if send_email:
            self._send_invite_email(invite, token)
        log_audit(
            self.db,
            action="user.invited",
            actor=invited_by,
            org_id=organization_id,
            entity="invite",
            entity_id=str(invite.id),
            metadata={"email": invite.email, "role": invite.role.value},
        )
        return invite, token

    def accept_invite(
        self,
        *,
        token: str,
        full_name: str | None,
        password: str,
    ) -> tuple[OrganizationInvite, User]:
        token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
        invite = (
            self.db.query(OrganizationInvite)
            .filter(OrganizationInvite.token_hash == token_hash)
            .first()
        )
        if not invite:
            raise ValueError("Invalid invite token")
        if invite.expires_at < datetime.now(timezone.utc):
            raise ValueError("Invite has expired")
        if invite.accepted_at:
            raise ValueError("Invite already accepted")
        user = self._get_or_create_user(invite.email, full_name, password)
        membership = (
            self.db.query(Membership)
            .filter(Membership.user_id == user.id, Membership.organization_id == invite.organization_id)
            .first()
        )
        if not membership:
            membership = Membership(
                user_id=user.id,
                organization_id=invite.organization_id,
                role=invite.role,
            )
            self.db.add(membership)
        invite.accepted_at = datetime.now(timezone.utc)
        self.db.add(invite)
        self.db.commit()
        log_audit(
            self.db,
            action="user.invite_accepted",
            actor=user.id,
            org_id=invite.organization_id,
            entity="membership",
            entity_id=str(membership.id),
            metadata={"email": invite.email, "role": invite.role.value},
        )
        return invite, user

    def _get_or_create_user(self, email: str, full_name: str | None, password: str) -> User:
        user = self.db.query(User).filter(User.email == email.lower()).one_or_none()
        hashed = self.passwords.hash_password(password)
        if user:
            if full_name:
                user.full_name = full_name
            user.hashed_password = hashed
            self.db.add(user)
            self.db.flush()
            return user
        user = User(email=email.lower(), full_name=full_name, hashed_password=hashed)
        self.db.add(user)
        self.db.flush()
        return user

    def _send_invite_email(self, invite: OrganizationInvite, token: str) -> None:
        accept_url = f"{settings.CLIENT_APP_URL}/accept-invite?token={token}"
        self.notifier.send_onboarding_email(
            to_email=invite.email,
            redirect_url=accept_url,
            metadata={
                "organization_id": str(invite.organization_id),
                "organization_name": invite.organization.name,
                "role": invite.role.value,
                "invite_id": str(invite.id),
            },
        )

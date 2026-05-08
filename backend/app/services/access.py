from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from backend.app.models.membership import Membership
from backend.app.models.organization import Organization
from backend.app.models.user import User


class AccessDeniedError(PermissionError):
    """Raised when a user attempts to access an unauthorized resource."""


class AccessService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def _get_user(self, user_id: uuid.UUID) -> User:
        user = self.db.get(User, user_id)
        if not user:
            raise AccessDeniedError("User not found")
        return user

    def require_staff(self, user_id: uuid.UUID) -> User:
        user = self._get_user(user_id)
        if not user.is_staff:
            raise AccessDeniedError("User is not an admin")
        return user

    def resolve_org(
        self,
        *,
        user_id: uuid.UUID,
        organization_id: uuid.UUID | None = None,
    ) -> tuple[User, Organization]:
        user = self._get_user(user_id)
        if user.is_staff:
            if organization_id:
                return user, self._get_org(organization_id)
            org = (
                self.db.query(Organization)
                .order_by(Organization.created_at.asc())
                .first()
            )
            if not org:
                raise AccessDeniedError("No organizations available")
            return user, org
        membership = self._membership_for_user(user_id=user.id, organization_id=organization_id)
        return user, membership.organization

    def member_orgs(self, user_id: uuid.UUID) -> list[Organization]:
        user = self._get_user(user_id)
        if user.is_staff:
            return list(self.db.query(Organization).order_by(Organization.created_at.desc()).all())
        memberships = (
            self.db.query(Membership)
            .filter(Membership.user_id == user_id)
            .all()
        )
        return [membership.organization for membership in memberships]

    def _membership_for_user(
        self,
        *,
        user_id: uuid.UUID,
        organization_id: uuid.UUID | None,
    ) -> Membership:
        query = self.db.query(Membership).filter(Membership.user_id == user_id)
        if organization_id:
            query = query.filter(Membership.organization_id == organization_id)
        membership = query.first()
        if membership:
            return membership
        raise AccessDeniedError("User is not a member of this organization")

    def _get_org(self, organization_id: uuid.UUID) -> Organization:
        org = self.db.get(Organization, organization_id)
        if not org:
            raise AccessDeniedError("Organization not found")
        return org

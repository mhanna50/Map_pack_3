from __future__ import annotations

import logging
import uuid

from sqlalchemy.orm import Session

from backend.app.models.membership import Membership
from backend.app.models.organization import Organization
from backend.app.models.user import User
from backend.app.models.enums import MembershipRole, OrganizationType
from backend.app.services.notifications import NotificationService
from backend.app.services.onboarding_tokens import OnboardingTokenSigner
from backend.app.core.config import settings

logger = logging.getLogger(__name__)


class ClientProvisioningService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.notifier = NotificationService()
        self.token_signer = OnboardingTokenSigner()

    def _get_or_create_user(self, email: str, full_name: str | None) -> User:
        user = self.db.query(User).filter(User.email == email).one_or_none()
        if user:
            if full_name and not user.full_name:
                user.full_name = full_name
                self.db.add(user)
            return user
        user = User(email=email, full_name=full_name)
        self.db.add(user)
        self.db.flush()
        return user

    def provision_paid_customer(
        self,
        *,
        email: str,
        company_name: str,
        plan: str = "starter",
        checkout_reference: str | None = None,
    ) -> Organization:
        logger.info("Provisioning paid customer email=%s company=%s", email, company_name)
        user = self._get_or_create_user(email, full_name=None)
        organization = Organization(
            name=company_name,
            org_type=OrganizationType.BUSINESS,
            plan_tier=plan,
        )
        self.db.add(organization)
        self.db.flush()
        membership = Membership(user_id=user.id, organization_id=organization.id, role=MembershipRole.OWNER)
        self.db.add(membership)
        self.db.commit()
        token = self.token_signer.create_token(org_id=str(organization.id), email=email, org_name=organization.name)
        client_base = str(settings.CLIENT_APP_URL).rstrip("/")
        onboarding_link = f"{client_base}/onboarding?token={token}"
        self.notifier.send_onboarding_email(
            to_email=email,
            redirect_url=onboarding_link,
            metadata={
                "organization_id": str(organization.id),
                "organization_name": organization.name,
                "plan": plan,
            },
        )
        logger.info("Provisioned organization %s for %s via checkout %s", organization.id, email, checkout_reference)
        return organization

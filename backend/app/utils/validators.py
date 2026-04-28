from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from backend.app.models.connected_account import ConnectedAccount
from backend.app.models.location import Location


def assert_location_in_org(db: Session, *, location_id: uuid.UUID, organization_id: uuid.UUID) -> Location:
    location = db.get(Location, location_id)
    if not location:
        raise ValueError("Location not found")
    if location.organization_id != organization_id:
        raise ValueError("Location does not belong to organization")
    return location


def assert_connected_account_in_org(
    db: Session, *, connected_account_id: uuid.UUID, organization_id: uuid.UUID
) -> ConnectedAccount:
    account = db.get(ConnectedAccount, connected_account_id)
    if not account:
        raise ValueError("Connected account not found")
    if account.organization_id != organization_id:
        raise ValueError("Connected account does not belong to organization")
    return account

from __future__ import annotations

import uuid

from sqlalchemy import MetaData, Table, insert, select
from sqlalchemy.dialects.postgresql import insert as postgresql_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.exc import IntegrityError, NoSuchTableError, SQLAlchemyError
from sqlalchemy.orm import Session

from backend.app.models.enums import OrganizationType

TENANT_BRIDGE_COLUMNS = ("tenant_id", "business_name", "slug", "tenant_type", "plan_tier")


def ensure_tenant_row(
    db: Session,
    *,
    tenant_id: uuid.UUID,
    business_name: str,
    tenant_type: OrganizationType | str = OrganizationType.AGENCY,
    slug: str | None = None,
    plan_tier: str | None = "starter",
) -> None:
    """Ensure a `tenants` parent row exists for memberships FK compatibility."""
    normalized_type = (
        tenant_type.value if isinstance(tenant_type, OrganizationType) else str(tenant_type or OrganizationType.AGENCY.value)
    )
    normalized_plan = plan_tier or "starter"
    bind = db.get_bind()
    if bind is None:
        return

    try:
        connection = db.connection()
        tenants_table = Table("tenants", MetaData(), autoload_with=connection)
    except (NoSuchTableError, SQLAlchemyError):
        return

    columns = set(tenants_table.c.keys())
    base_payload = {
        "tenant_id": str(tenant_id),
        "business_name": business_name,
        "slug": slug,
        "tenant_type": normalized_type,
        "plan_tier": normalized_plan,
    }
    payload = {
        key: base_payload[key]
        for key in TENANT_BRIDGE_COLUMNS
        if key in columns
    }
    if not {"tenant_id", "business_name"}.issubset(payload):
        return

    try:
        if connection.dialect.name == "postgresql":
            statement = postgresql_insert(tenants_table).values(payload).on_conflict_do_nothing()
        elif connection.dialect.name == "sqlite":
            statement = sqlite_insert(tenants_table).values(payload).on_conflict_do_nothing()
        else:
            existing_tenant = db.execute(
                select(tenants_table.c.tenant_id).where(tenants_table.c.tenant_id == payload["tenant_id"])
            ).first()
            if existing_tenant:
                return
            statement = insert(tenants_table).values(payload)
        db.execute(statement)
    except IntegrityError:
        return
    except SQLAlchemyError as exc:
        message = str(exc).lower()
        # Older local schemas may not have tenant tables/types.
        if (
            'relation "tenants" does not exist' in message
            or 'type "tenant_type" does not exist' in message
            or "no such table: tenants" in message
        ):
            return
        raise

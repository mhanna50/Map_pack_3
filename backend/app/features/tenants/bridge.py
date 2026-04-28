from __future__ import annotations

import uuid

from sqlalchemy import inspect, text
from sqlalchemy.exc import NoSuchTableError, SQLAlchemyError
from sqlalchemy.orm import Session

from backend.app.models.enums import OrganizationType


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
        columns = {column["name"] for column in inspect(bind).get_columns("tenants")}
    except (NoSuchTableError, SQLAlchemyError):
        return

    payload = {
        key: value
        for key, value in {
            "tenant_id": str(tenant_id),
            "business_name": business_name,
            "slug": slug,
            "tenant_type": normalized_type,
            "plan_tier": normalized_plan,
        }.items()
        if key in columns
    }
    if not {"tenant_id", "business_name"}.issubset(payload):
        return

    try:
        column_list = ", ".join(payload.keys())
        value_list = ", ".join(f":{key}" for key in payload.keys())
        db.execute(
            text(
                f"""
                insert into tenants ({column_list})
                values ({value_list})
                on conflict (tenant_id) do nothing
                """
            ),
            payload,
        )
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

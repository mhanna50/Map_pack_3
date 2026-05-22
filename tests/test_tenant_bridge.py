from __future__ import annotations

import uuid

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.app.features.tenants.bridge import ensure_tenant_row
from backend.app.models.enums import OrganizationType


def test_ensure_tenant_row_inserts_once_for_existing_tenants_table():
    engine = create_engine("sqlite+pysqlite:///:memory:", future=True)
    with engine.begin() as connection:
        connection.execute(
            text(
                """
                create table tenants (
                    tenant_id text primary key,
                    business_name text not null,
                    slug text,
                    tenant_type text,
                    plan_tier text
                )
                """
            )
        )

    SessionLocal = sessionmaker(bind=engine, future=True)
    tenant_id = uuid.uuid4()
    with SessionLocal() as session:
        ensure_tenant_row(
            session,
            tenant_id=tenant_id,
            business_name="Original Business",
            tenant_type=OrganizationType.BUSINESS,
            slug="original-business",
            plan_tier="growth",
        )
        ensure_tenant_row(
            session,
            tenant_id=tenant_id,
            business_name="Changed Business",
            tenant_type=OrganizationType.AGENCY,
            slug="changed-business",
            plan_tier="starter",
        )

        rows = session.execute(
            text(
                """
                select tenant_id, business_name, slug, tenant_type, plan_tier
                from tenants
                """
            )
        ).mappings().all()

    assert rows == [
        {
            "tenant_id": str(tenant_id),
            "business_name": "Original Business",
            "slug": "original-business",
            "tenant_type": OrganizationType.BUSINESS.value,
            "plan_tier": "growth",
        }
    ]


def test_ensure_tenant_row_ignores_missing_tenants_table():
    engine = create_engine("sqlite+pysqlite:///:memory:", future=True)
    SessionLocal = sessionmaker(bind=engine, future=True)

    with SessionLocal() as session:
        ensure_tenant_row(
            session,
            tenant_id=uuid.uuid4(),
            business_name="Missing Table Business",
        )

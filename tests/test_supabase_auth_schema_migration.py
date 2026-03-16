from __future__ import annotations

from pathlib import Path


MIGRATION_PATH = (
    Path(__file__).resolve().parents[1]
    / "infra"
    / "supabase"
    / "migrations"
    / "202603141245_auth_role_routing_redesign.sql"
)


def _sql() -> str:
    assert MIGRATION_PATH.exists(), f"Missing migration file: {MIGRATION_PATH}"
    return MIGRATION_PATH.read_text(encoding="utf-8").lower()


def test_supabase_auth_redesign_migration_contains_core_schema() -> None:
    sql = _sql()
    assert "create table if not exists public.profiles" in sql
    assert "create table if not exists public.tenants" in sql
    assert "create table if not exists public.memberships" in sql
    assert "create table if not exists public.onboarding_progress" in sql
    assert "create type public.app_role as enum ('owner_admin', 'client')" in sql


def test_supabase_auth_redesign_migration_contains_post_login_resolver() -> None:
    sql = _sql()
    assert "create or replace function public.resolve_post_login_destination()" in sql
    assert "'/admin'::text" in sql
    assert "'/dashboard'::text" in sql
    assert "'/onboarding?step='" in sql
    assert "grant execute on function public.resolve_post_login_destination() to authenticated" in sql


def test_supabase_auth_redesign_migration_enforces_rls_policies() -> None:
    sql = _sql()
    assert "alter table public.profiles enable row level security" in sql
    assert "alter table public.tenants enable row level security" in sql
    assert "alter table public.memberships enable row level security" in sql
    assert "alter table public.onboarding_progress enable row level security" in sql
    assert "create policy profiles_select_self_or_admin" in sql
    assert "create policy tenants_select_member_or_admin" in sql
    assert "create policy memberships_select_self_or_admin" in sql
    assert "create policy onboarding_progress_select_self_or_admin" in sql


def test_supabase_auth_redesign_migration_includes_progress_sync_triggers() -> None:
    sql = _sql()
    assert "create or replace function public.sync_onboarding_progress_from_pending_onboarding()" in sql
    assert "create trigger sync_onboarding_progress_from_pending_onboarding" in sql
    assert "create or replace function public.handle_auth_user_created()" in sql
    assert "create trigger on_auth_user_created" in sql

-- Tie Google Business Profile OAuth records to the user who connected them and
-- keep encrypted token columns server-only.

alter table if exists public.connected_accounts
  add column if not exists user_id uuid references public.users(id);

alter table if exists public.gbp_connections
  add column if not exists user_id uuid references public.users(id),
  add column if not exists last_sync_at timestamptz;

create index if not exists ix_connected_accounts_user_id on public.connected_accounts (user_id);
create index if not exists ix_gbp_connections_user_id on public.gbp_connections (user_id);

alter table if exists public.connected_accounts enable row level security;
alter table if exists public.gbp_connections enable row level security;

drop policy if exists connected_accounts_select_member on public.connected_accounts;
create policy connected_accounts_select_member
on public.connected_accounts
for select
to authenticated
using (public.tenant_has_access(tenant_id));

drop policy if exists gbp_connections_select_member on public.gbp_connections;
create policy gbp_connections_select_member
on public.gbp_connections
for select
to authenticated
using (public.tenant_has_access(tenant_id));

revoke all on public.connected_accounts from anon;
revoke all on public.gbp_connections from anon;

revoke select on public.connected_accounts from authenticated;
revoke select on public.gbp_connections from authenticated;

grant select (
  id,
  tenant_id,
  organization_id,
  user_id,
  provider,
  external_account_id,
  display_name,
  scopes,
  access_token_expires_at,
  metadata_json,
  created_at,
  updated_at
) on public.connected_accounts to authenticated;

grant select (
  id,
  tenant_id,
  user_id,
  google_account_email,
  account_resource_name,
  scopes,
  status,
  access_token_expires_at,
  last_sync_at,
  metadata_json,
  created_at,
  updated_at
) on public.gbp_connections to authenticated;

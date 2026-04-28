-- Harden tenant isolation for tables/views that can be queried through Supabase.

-- Views must invoke underlying table RLS using the caller, not the view owner.
alter view if exists public.post_history set (security_invoker = true);
alter view if exists public.content_assets set (security_invoker = true);
grant select on public.post_history to authenticated;
grant select on public.content_assets to authenticated;
revoke select on public.post_history from anon;
revoke select on public.content_assets from anon;

-- Direct dashboard reads still need table privileges; RLS remains the tenant
-- boundary for authenticated users.
grant select on public.locations to authenticated;
grant select on public.posts to authenticated;
grant select on public.post_jobs to authenticated;
grant select on public.reviews to authenticated;
grant select on public.review_requests to authenticated;
grant select on public.billing_subscriptions to authenticated;
grant select on public.media_assets to authenticated;
grant select on public.support_tickets to authenticated;
revoke select on public.locations from anon;
revoke select on public.posts from anon;
revoke select on public.post_jobs from anon;
revoke select on public.reviews from anon;
revoke select on public.review_requests from anon;
revoke select on public.billing_subscriptions from anon;
revoke select on public.media_assets from anon;
revoke select on public.support_tickets from anon;

-- The old permissive org_isolation policy was not an AND guard. In permissive
-- RLS it could allow rows where organization_id is null, so replace it with
-- normal tenant membership policies on the organization_id-only tables below.
drop policy if exists org_isolation on public.actions;
drop policy if exists org_isolation on public.alerts;
drop policy if exists org_isolation on public.audit_logs;
drop policy if exists org_isolation on public.content_items;
drop policy if exists org_isolation on public.content_plans;
drop policy if exists org_isolation on public.locations;
drop policy if exists org_isolation on public.media_assets;
drop policy if exists org_isolation on public.post_attempts;
drop policy if exists org_isolation on public.post_jobs;
drop policy if exists org_isolation on public.posts;
drop policy if exists org_isolation on public.rate_limit_state;

alter table if exists public.organizations enable row level security;
drop policy if exists organizations_select_member_or_admin on public.organizations;
create policy organizations_select_member_or_admin
on public.organizations
for select
to authenticated
using (
  public.is_owner_admin(auth.uid())
  or public.tenant_has_access(id)
  or public.tenant_has_access(organization_id)
);

drop policy if exists organizations_mutate_owner_admin on public.organizations;
create policy organizations_mutate_owner_admin
on public.organizations
for all
to authenticated
using (public.is_owner_admin(auth.uid()))
with check (public.is_owner_admin(auth.uid()));

alter table if exists public.organization_invites enable row level security;
drop policy if exists organization_invites_admin_all on public.organization_invites;
create policy organization_invites_admin_all
on public.organization_invites
for all
to authenticated
using (
  public.is_owner_admin(auth.uid())
  or public.user_is_admin(organization_id)
)
with check (
  public.is_owner_admin(auth.uid())
  or public.user_is_admin(organization_id)
);

alter table if exists public.client_uploads enable row level security;
drop policy if exists client_uploads_select_member on public.client_uploads;
create policy client_uploads_select_member
on public.client_uploads
for select
to authenticated
using (public.tenant_has_access(organization_id));

drop policy if exists client_uploads_insert_member on public.client_uploads;
create policy client_uploads_insert_member
on public.client_uploads
for insert
to authenticated
with check (public.tenant_has_access(organization_id));

drop policy if exists client_uploads_update_member on public.client_uploads;
create policy client_uploads_update_member
on public.client_uploads
for update
to authenticated
using (public.tenant_has_access(organization_id))
with check (public.tenant_has_access(organization_id));

drop policy if exists client_uploads_delete_admin on public.client_uploads;
create policy client_uploads_delete_admin
on public.client_uploads
for delete
to authenticated
using (public.user_is_admin(organization_id));

alter table if exists public.org_settings enable row level security;
drop policy if exists org_settings_select_member on public.org_settings;
create policy org_settings_select_member
on public.org_settings
for select
to authenticated
using (public.tenant_has_access(organization_id));

drop policy if exists org_settings_insert_admin on public.org_settings;
create policy org_settings_insert_admin
on public.org_settings
for insert
to authenticated
with check (public.user_is_admin(organization_id));

drop policy if exists org_settings_update_admin on public.org_settings;
create policy org_settings_update_admin
on public.org_settings
for update
to authenticated
using (public.user_is_admin(organization_id))
with check (public.user_is_admin(organization_id));

drop policy if exists org_settings_delete_admin on public.org_settings;
create policy org_settings_delete_admin
on public.org_settings
for delete
to authenticated
using (public.user_is_admin(organization_id));

alter table if exists public.photo_requests enable row level security;
drop policy if exists photo_requests_select_member on public.photo_requests;
create policy photo_requests_select_member
on public.photo_requests
for select
to authenticated
using (public.tenant_has_access(organization_id));

drop policy if exists photo_requests_insert_admin on public.photo_requests;
create policy photo_requests_insert_admin
on public.photo_requests
for insert
to authenticated
with check (public.user_is_admin(organization_id));

drop policy if exists photo_requests_update_admin on public.photo_requests;
create policy photo_requests_update_admin
on public.photo_requests
for update
to authenticated
using (public.user_is_admin(organization_id))
with check (public.user_is_admin(organization_id));

drop policy if exists photo_requests_delete_admin on public.photo_requests;
create policy photo_requests_delete_admin
on public.photo_requests
for delete
to authenticated
using (public.user_is_admin(organization_id));

-- These tables only have organization_id in the current production schema.
alter table if exists public.content_items enable row level security;
drop policy if exists content_items_select_member on public.content_items;
create policy content_items_select_member
on public.content_items
for select
to authenticated
using (public.tenant_has_access(organization_id));

drop policy if exists content_items_insert_admin on public.content_items;
create policy content_items_insert_admin
on public.content_items
for insert
to authenticated
with check (public.user_is_admin(organization_id));

drop policy if exists content_items_update_admin on public.content_items;
create policy content_items_update_admin
on public.content_items
for update
to authenticated
using (public.user_is_admin(organization_id))
with check (public.user_is_admin(organization_id));

drop policy if exists content_items_delete_admin on public.content_items;
create policy content_items_delete_admin
on public.content_items
for delete
to authenticated
using (public.user_is_admin(organization_id));

alter table if exists public.content_plans enable row level security;
drop policy if exists content_plans_select_member on public.content_plans;
create policy content_plans_select_member
on public.content_plans
for select
to authenticated
using (public.tenant_has_access(organization_id));

drop policy if exists content_plans_insert_admin on public.content_plans;
create policy content_plans_insert_admin
on public.content_plans
for insert
to authenticated
with check (public.user_is_admin(organization_id));

drop policy if exists content_plans_update_admin on public.content_plans;
create policy content_plans_update_admin
on public.content_plans
for update
to authenticated
using (public.user_is_admin(organization_id))
with check (public.user_is_admin(organization_id));

drop policy if exists content_plans_delete_admin on public.content_plans;
create policy content_plans_delete_admin
on public.content_plans
for delete
to authenticated
using (public.user_is_admin(organization_id));

alter table if exists public.post_jobs enable row level security;
drop policy if exists post_jobs_select_member on public.post_jobs;
create policy post_jobs_select_member
on public.post_jobs
for select
to authenticated
using (public.tenant_has_access(organization_id));

drop policy if exists post_jobs_insert_admin on public.post_jobs;
create policy post_jobs_insert_admin
on public.post_jobs
for insert
to authenticated
with check (public.user_is_admin(organization_id));

drop policy if exists post_jobs_update_admin on public.post_jobs;
create policy post_jobs_update_admin
on public.post_jobs
for update
to authenticated
using (public.user_is_admin(organization_id))
with check (public.user_is_admin(organization_id));

drop policy if exists post_jobs_delete_admin on public.post_jobs;
create policy post_jobs_delete_admin
on public.post_jobs
for delete
to authenticated
using (public.user_is_admin(organization_id));

alter table if exists public.post_attempts enable row level security;
drop policy if exists post_attempts_select_member on public.post_attempts;
create policy post_attempts_select_member
on public.post_attempts
for select
to authenticated
using (public.tenant_has_access(organization_id));

drop policy if exists post_attempts_insert_admin on public.post_attempts;
create policy post_attempts_insert_admin
on public.post_attempts
for insert
to authenticated
with check (public.user_is_admin(organization_id));

drop policy if exists post_attempts_update_admin on public.post_attempts;
create policy post_attempts_update_admin
on public.post_attempts
for update
to authenticated
using (public.user_is_admin(organization_id))
with check (public.user_is_admin(organization_id));

drop policy if exists post_attempts_delete_admin on public.post_attempts;
create policy post_attempts_delete_admin
on public.post_attempts
for delete
to authenticated
using (public.user_is_admin(organization_id));

alter table if exists public.rate_limit_state enable row level security;
drop policy if exists rate_limit_state_select_member on public.rate_limit_state;
create policy rate_limit_state_select_member
on public.rate_limit_state
for select
to authenticated
using (public.tenant_has_access(organization_id));

drop policy if exists rate_limit_state_insert_admin on public.rate_limit_state;
create policy rate_limit_state_insert_admin
on public.rate_limit_state
for insert
to authenticated
with check (public.user_is_admin(organization_id));

drop policy if exists rate_limit_state_update_admin on public.rate_limit_state;
create policy rate_limit_state_update_admin
on public.rate_limit_state
for update
to authenticated
using (public.user_is_admin(organization_id))
with check (public.user_is_admin(organization_id));

drop policy if exists rate_limit_state_delete_admin on public.rate_limit_state;
create policy rate_limit_state_delete_admin
on public.rate_limit_state
for delete
to authenticated
using (public.user_is_admin(organization_id));

-- Prevent authenticated users from passing arbitrary user IDs to SECURITY
-- DEFINER helper functions exposed in public.
create or replace function public.has_tenant_membership(_tenant_id uuid, _user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path to 'public', 'auth'
as $function$
  select _tenant_id is not null
    and _user_id is not null
    and (
      coalesce(_user_id = auth.uid(), false)
      or public.is_owner_admin(auth.uid())
    )
    and (
      exists (
        select 1
        from public.memberships m
        where m.tenant_id = _tenant_id
          and m.user_id = _user_id
      )
      or exists (
        select 1
        from public.profiles p
        where p.user_id = _user_id
          and coalesce(
            nullif(to_jsonb(p) ->> 'default_tenant_id', '')::uuid,
            nullif(to_jsonb(p) ->> 'tenant_id', '')::uuid
          ) = _tenant_id
      )
    );
$function$;

create or replace function public.user_primary_client_tenant(_user_id uuid default auth.uid())
returns uuid
language plpgsql
stable
security definer
set search_path to 'public', 'auth'
as $function$
declare
  v_tenant uuid;
begin
  if _user_id is null then
    return null;
  end if;

  if auth.uid() is null or (_user_id <> auth.uid() and not public.is_owner_admin(auth.uid())) then
    return null;
  end if;

  if to_regclass('public.memberships') is not null then
    select m.tenant_id
    into v_tenant
    from public.memberships m
    where m.user_id = _user_id
      and (
        coalesce(to_jsonb(m) ->> 'app_role', '') = 'client'
        or lower(coalesce(to_jsonb(m) ->> 'role', '')) in ('member', 'client')
      )
    order by coalesce((to_jsonb(m) ->> 'is_primary')::boolean, false) desc, m.created_at asc
    limit 1;

    if v_tenant is not null then
      return v_tenant;
    end if;
  end if;

  if to_regclass('public.profiles') is not null then
    begin
      select coalesce(
        nullif(to_jsonb(p) ->> 'default_tenant_id', '')::uuid,
        nullif(to_jsonb(p) ->> 'tenant_id', '')::uuid
      )
      into v_tenant
      from public.profiles p
      where p.user_id = _user_id
      limit 1;
    exception
      when invalid_text_representation then
        v_tenant := null;
    end;
  end if;

  return v_tenant;
end;
$function$;

-- Helper functions are for authenticated callers/RLS only; trigger functions
-- should not be callable through /rpc at all.
revoke execute on function public.current_tenant_ids() from public, anon;
revoke execute on function public.has_tenant_membership(uuid, uuid) from public, anon;
revoke execute on function public.is_owner_admin(uuid) from public, anon;
revoke execute on function public.is_superadmin() from public, anon;
revoke execute on function public.tenant_has_access(uuid) from public, anon;
revoke execute on function public.user_is_admin(uuid) from public, anon;
revoke execute on function public.user_primary_client_tenant(uuid) from public, anon;
revoke execute on function public.user_role_in_tenant(uuid) from public, anon;
revoke execute on function public.resolve_post_login_destination() from public, anon;
revoke execute on function public.handle_auth_user_created() from public, anon, authenticated;
revoke execute on function public.sync_onboarding_progress_from_pending_onboarding() from public, anon, authenticated;

grant execute on function public.current_tenant_ids() to authenticated;
grant execute on function public.has_tenant_membership(uuid, uuid) to authenticated;
grant execute on function public.is_owner_admin(uuid) to authenticated;
grant execute on function public.is_superadmin() to authenticated;
grant execute on function public.tenant_has_access(uuid) to authenticated;
grant execute on function public.user_is_admin(uuid) to authenticated;
grant execute on function public.user_primary_client_tenant(uuid) to authenticated;
grant execute on function public.user_role_in_tenant(uuid) to authenticated;
grant execute on function public.resolve_post_login_destination() to authenticated;

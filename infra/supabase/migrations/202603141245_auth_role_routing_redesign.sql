-- Map Pack 3 auth/authorization redesign for Supabase
-- Canonical model:
--   auth.users (credentials, managed by Supabase)
--   public.profiles (1:1 app profile)
--   public.tenants (workspace/account)
--   public.memberships (user<->tenant + explicit app_role)
--   public.onboarding_progress (persisted onboarding routing state)

begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'app_role'
  ) then
    create type public.app_role as enum ('owner_admin', 'client');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Core tables (idempotent + compatibility-safe)
-- ---------------------------------------------------------------------------
create table if not exists public.tenants (
  tenant_id uuid primary key default gen_random_uuid(),
  business_name text not null,
  slug text,
  status text not null default 'invited',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tenants add column if not exists business_name text;
update public.tenants set business_name = coalesce(nullif(business_name, ''), 'New tenant') where business_name is null or business_name = '';
alter table public.tenants alter column business_name set not null;
alter table public.tenants add column if not exists status text;
update public.tenants
set status = 'invited'
where status is null or btrim(status::text) = '';
alter table public.tenants alter column status set default 'invited';
alter table public.tenants add column if not exists created_at timestamptz not null default now();
alter table public.tenants add column if not exists updated_at timestamptz not null default now();
create unique index if not exists uq_tenants_slug on public.tenants (slug) where slug is not null;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  default_tenant_id uuid references public.tenants(tenant_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists default_tenant_id uuid references public.tenants(tenant_id) on delete set null;
alter table public.profiles add column if not exists created_at timestamptz not null default now();
alter table public.profiles add column if not exists updated_at timestamptz not null default now();
create index if not exists ix_profiles_default_tenant_id on public.profiles (default_tenant_id);

create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(tenant_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  app_role public.app_role not null default 'client',
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.memberships add column if not exists tenant_id uuid references public.tenants(tenant_id) on delete cascade;
alter table public.memberships add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.memberships add column if not exists app_role public.app_role;
alter table public.memberships add column if not exists is_primary boolean not null default false;
alter table public.memberships add column if not exists created_at timestamptz not null default now();
alter table public.memberships add column if not exists updated_at timestamptz not null default now();

update public.memberships m
set app_role = case
  when lower(coalesce(to_jsonb(m) ->> 'app_role', '')) = 'owner_admin' then 'owner_admin'::public.app_role
  when lower(coalesce(to_jsonb(m) ->> 'role', '')) in ('owner_admin', 'owner', 'admin', 'super_admin', 'superadmin', 'staff') then 'owner_admin'::public.app_role
  else 'client'::public.app_role
end
where app_role is null;

alter table public.memberships alter column app_role set default 'client'::public.app_role;
alter table public.memberships alter column app_role set not null;
create unique index if not exists uq_memberships_user_tenant on public.memberships (user_id, tenant_id);
create index if not exists ix_memberships_tenant_id on public.memberships (tenant_id);
create index if not exists ix_memberships_user_id on public.memberships (user_id);

create table if not exists public.onboarding_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id uuid not null references public.tenants(tenant_id) on delete cascade,
  next_step text not null default 'account',
  status text not null default 'in_progress',
  onboarding_complete boolean not null default false,
  completed_steps jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, tenant_id)
);

alter table public.onboarding_progress add column if not exists next_step text;
alter table public.onboarding_progress add column if not exists status text;
alter table public.onboarding_progress add column if not exists onboarding_complete boolean not null default false;
alter table public.onboarding_progress add column if not exists completed_steps jsonb not null default '[]'::jsonb;
alter table public.onboarding_progress add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.onboarding_progress add column if not exists created_at timestamptz not null default now();
alter table public.onboarding_progress add column if not exists updated_at timestamptz not null default now();

alter table public.onboarding_progress drop constraint if exists onboarding_progress_next_step_check;
alter table public.onboarding_progress add constraint onboarding_progress_next_step_check
  check (next_step in ('account', 'business_setup', 'billing', 'google', 'finish', 'done'));

alter table public.onboarding_progress drop constraint if exists onboarding_progress_status_check;
alter table public.onboarding_progress add constraint onboarding_progress_status_check
  check (lower(status) in (
    'in_progress',
    'business_setup',
    'stripe_pending',
    'stripe_started',
    'google_pending',
    'google_connected',
    'completed',
    'activated',
    'canceled'
  ));

create index if not exists ix_onboarding_progress_tenant_id on public.onboarding_progress (tenant_id);

-- ---------------------------------------------------------------------------
-- Audit/compatibility backfill
-- ---------------------------------------------------------------------------
insert into public.profiles (user_id, email, full_name, created_at, updated_at)
select
  au.id,
  lower(au.email),
  nullif(coalesce(au.raw_user_meta_data ->> 'full_name', au.raw_user_meta_data ->> 'name'), ''),
  now(),
  now()
from auth.users au
on conflict (user_id) do update
set
  email = coalesce(public.profiles.email, excluded.email),
  full_name = coalesce(public.profiles.full_name, excluded.full_name),
  updated_at = now();

do $$
begin
  if to_regclass('public.users') is not null then
    execute $sql$
      insert into public.profiles (user_id, email, full_name, created_at, updated_at)
      select
        u.id,
        lower(coalesce(to_jsonb(u) ->> 'email', '')),
        nullif(coalesce(to_jsonb(u) ->> 'full_name', ''), ''),
        now(),
        now()
      from public.users u
      where u.id is not null
      on conflict (user_id) do update
      set
        email = coalesce(public.profiles.email, excluded.email),
        full_name = coalesce(public.profiles.full_name, excluded.full_name),
        updated_at = now();
    $sql$;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Trigger helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['tenants', 'profiles', 'memberships', 'onboarding_progress']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists %I on public.%I', 'set_updated_at_' || t, t);
      execute format(
        'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
        'set_updated_at_' || t,
        t
      );
    end if;
  end loop;
end;
$$;

create or replace function public.handle_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.profiles (user_id, email, full_name, created_at, updated_at)
  values (
    new.id,
    lower(new.email),
    nullif(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'), ''),
    now(),
    now()
  )
  on conflict (user_id) do update
  set
    email = excluded.email,
    full_name = coalesce(public.profiles.full_name, excluded.full_name),
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_auth_user_created();

-- ---------------------------------------------------------------------------
-- Onboarding state normalization and resolver
-- ---------------------------------------------------------------------------
create or replace function public.compute_onboarding_state(_status text)
returns table(next_step text, onboarding_complete boolean, completed_steps jsonb)
language plpgsql
immutable
as $$
declare
  s text := lower(coalesce(_status, 'in_progress'));
begin
  if s in ('completed', 'activated') then
    return query select 'done', true, '["account","business_setup","billing","google","finish"]'::jsonb;
  elsif s = 'google_connected' then
    return query select 'finish', false, '["account","business_setup","billing","google"]'::jsonb;
  elsif s = 'google_pending' then
    return query select 'google', false, '["account","business_setup","billing"]'::jsonb;
  elsif s in ('stripe_pending', 'stripe_started') then
    return query select 'google', false, '["account","business_setup","billing"]'::jsonb;
  elsif s = 'business_setup' then
    return query select 'billing', false, '["account","business_setup"]'::jsonb;
  else
    return query select 'account', false, '[]'::jsonb;
  end if;
end;
$$;

create or replace function public.is_owner_admin(_user_id uuid default auth.uid())
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_membership boolean := false;
  v_profile boolean := false;
  v_staff boolean := false;
begin
  if _user_id is null then
    return false;
  end if;

  if to_regclass('public.memberships') is not null then
    select exists (
      select 1
      from public.memberships m
      where m.user_id = _user_id
        and (
          coalesce(to_jsonb(m) ->> 'app_role', '') = 'owner_admin'
          or lower(coalesce(to_jsonb(m) ->> 'role', '')) in ('owner_admin', 'owner', 'admin', 'super_admin', 'superadmin', 'staff')
        )
    )
    into v_membership;
  end if;

  if to_regclass('public.profiles') is not null then
    select exists (
      select 1
      from public.profiles p
      where p.user_id = _user_id
        and lower(coalesce(to_jsonb(p) ->> 'role', '')) in ('owner_admin', 'admin', 'super_admin', 'superadmin', 'staff')
    )
    into v_profile;
  end if;

  if to_regclass('public.users') is not null then
    execute 'select exists (select 1 from public.users u where u.id = $1 and coalesce(u.is_staff, false) = true)'
    into v_staff
    using _user_id;
  end if;

  return coalesce(v_membership, false) or coalesce(v_profile, false) or coalesce(v_staff, false);
end;
$$;

create or replace function public.has_tenant_membership(_tenant_id uuid, _user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
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
  );
$$;

create or replace function public.user_primary_client_tenant(_user_id uuid default auth.uid())
returns uuid
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_tenant uuid;
begin
  if _user_id is null then
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
$$;

create or replace function public.resolve_post_login_destination()
returns table(
  role text,
  tenant_id uuid,
  destination text,
  onboarding_complete boolean,
  next_step text,
  diagnostics jsonb
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_user uuid := auth.uid();
  v_owner_admin boolean := false;
  v_tenant uuid;
  v_onboarding_complete boolean;
  v_next_step text;
  v_status text;
  v_tenant_active boolean := false;
  v_billing_active boolean := false;
begin
  if v_user is null then
    return query
    select
      'invalid'::text,
      null::uuid,
      '/sign-in?error=not_authenticated'::text,
      false,
      'account'::text,
      jsonb_build_object('reason', 'missing_auth_uid');
    return;
  end if;

  v_owner_admin := public.is_owner_admin(v_user);
  if v_owner_admin then
    return query
    select
      'owner_admin'::text,
      null::uuid,
      '/admin'::text,
      true,
      null::text,
      jsonb_build_object('source', 'owner_admin_membership_or_staff');
    return;
  end if;

  v_tenant := public.user_primary_client_tenant(v_user);
  if v_tenant is null then
    return query
    select
      'invalid'::text,
      null::uuid,
      '/sign-in?error=invalid_role'::text,
      false,
      'account'::text,
      jsonb_build_object('reason', 'no_client_membership');
    return;
  end if;

  select
    op.onboarding_complete,
    op.next_step,
    lower(op.status)
  into
    v_onboarding_complete,
    v_next_step,
    v_status
  from public.onboarding_progress op
  where op.user_id = v_user
    and op.tenant_id = v_tenant
  limit 1;

  if v_onboarding_complete is null and to_regclass('public.pending_onboarding') is not null then
    begin
      select
        state.onboarding_complete,
        state.next_step,
        lower(coalesce(po.status::text, 'in_progress'))
      into
        v_onboarding_complete,
        v_next_step,
        v_status
      from public.pending_onboarding po
      join auth.users au
        on lower(au.email) = lower(po.email)
      cross join lateral public.compute_onboarding_state(po.status) state
      where au.id = v_user
        and (
          coalesce(to_jsonb(po) ->> 'tenant_id', '') = ''
          or coalesce(to_jsonb(po) ->> 'tenant_id', '') = v_tenant::text
        )
      order by po.invited_at desc nulls last
      limit 1;
    exception
      when others then
        v_onboarding_complete := null;
        v_next_step := null;
        v_status := null;
    end;
  end if;

  if to_regclass('public.tenants') is not null then
    select lower(coalesce(t.status::text, '')) = 'active'
    into v_tenant_active
    from public.tenants t
    where t.tenant_id = v_tenant
    limit 1;
  end if;

  if to_regclass('public.billing_subscriptions') is not null then
    select exists (
      select 1
      from public.billing_subscriptions bs
      where bs.tenant_id = v_tenant
        and lower(coalesce(bs.status::text, '')) in ('active', 'trialing', 'past_due')
    )
    into v_billing_active;
  end if;

  if v_onboarding_complete is null then
    v_onboarding_complete := false;
    v_next_step := coalesce(v_next_step, 'account');
    v_status := coalesce(v_status, 'in_progress');
  end if;

  if coalesce(v_tenant_active, false) or coalesce(v_billing_active, false) then
    v_onboarding_complete := true;
    v_next_step := 'done';
    v_status := 'completed';
  end if;

  if v_onboarding_complete then
    return query
    select
      'client'::text,
      v_tenant,
      '/dashboard'::text,
      true,
      'done'::text,
      jsonb_build_object(
        'status', coalesce(v_status, 'completed'),
        'tenant_active', coalesce(v_tenant_active, false),
        'billing_active', coalesce(v_billing_active, false)
      );
    return;
  end if;

  return query
  select
    'client'::text,
    v_tenant,
    '/onboarding?step=' || coalesce(v_next_step, 'account'),
    false,
    coalesce(v_next_step, 'account'),
    jsonb_build_object(
      'status', coalesce(v_status, 'in_progress'),
      'tenant_active', coalesce(v_tenant_active, false),
      'billing_active', coalesce(v_billing_active, false)
    );
end;
$$;

revoke all on function public.resolve_post_login_destination() from public;
grant execute on function public.resolve_post_login_destination() to authenticated;
grant execute on function public.resolve_post_login_destination() to service_role;

-- ---------------------------------------------------------------------------
-- Sync onboarding_progress from pending_onboarding (if table exists)
-- ---------------------------------------------------------------------------
create or replace function public.sync_onboarding_progress_from_pending_onboarding()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text;
  v_status text;
  v_tenant_id uuid;
  v_user_id uuid;
  v_next_step text;
  v_complete boolean;
  v_completed_steps jsonb;
  v_tenant_text text;
begin
  v_email := nullif(lower(coalesce(to_jsonb(new) ->> 'email', '')), '');
  if v_email is null then
    return new;
  end if;

  select au.id
  into v_user_id
  from auth.users au
  where lower(au.email) = v_email
  limit 1;

  if v_user_id is null then
    return new;
  end if;

  v_tenant_text := nullif(coalesce(to_jsonb(new) ->> 'tenant_id', ''), '');
  if v_tenant_text is not null then
    begin
      v_tenant_id := v_tenant_text::uuid;
    exception
      when invalid_text_representation then
        v_tenant_id := null;
    end;
  end if;

  if v_tenant_id is null then
    begin
      select coalesce(
        nullif(to_jsonb(p) ->> 'default_tenant_id', '')::uuid,
        nullif(to_jsonb(p) ->> 'tenant_id', '')::uuid
      )
      into v_tenant_id
      from public.profiles p
      where p.user_id = v_user_id
      limit 1;
    exception
      when invalid_text_representation then
        v_tenant_id := null;
    end;
  end if;

  if v_tenant_id is null then
    return new;
  end if;

  v_status := lower(coalesce(to_jsonb(new) ->> 'status', 'in_progress'));
  select state.next_step, state.onboarding_complete, state.completed_steps
  into v_next_step, v_complete, v_completed_steps
  from public.compute_onboarding_state(v_status) state;

  insert into public.onboarding_progress (
    user_id,
    tenant_id,
    next_step,
    status,
    onboarding_complete,
    completed_steps,
    metadata,
    created_at,
    updated_at
  )
  values (
    v_user_id,
    v_tenant_id,
    coalesce(v_next_step, 'account'),
    coalesce(v_status, 'in_progress'),
    coalesce(v_complete, false),
    coalesce(v_completed_steps, '[]'::jsonb),
    jsonb_build_object(
      'source', 'pending_onboarding',
      'last_pending_status', v_status,
      'synced_at', now()
    ),
    now(),
    now()
  )
  on conflict (user_id, tenant_id) do update
  set
    next_step = excluded.next_step,
    status = excluded.status,
    onboarding_complete = excluded.onboarding_complete,
    completed_steps = excluded.completed_steps,
    metadata = coalesce(public.onboarding_progress.metadata, '{}'::jsonb) || jsonb_build_object(
      'source', 'pending_onboarding',
      'last_pending_status', v_status,
      'synced_at', now()
    ),
    updated_at = now();

  return new;
end;
$$;

do $$
begin
  if to_regclass('public.pending_onboarding') is not null then
    execute 'drop trigger if exists sync_onboarding_progress_from_pending_onboarding on public.pending_onboarding';
    execute 'create trigger sync_onboarding_progress_from_pending_onboarding after insert or update on public.pending_onboarding for each row execute function public.sync_onboarding_progress_from_pending_onboarding()';
  end if;
end;
$$;

-- Backfill onboarding_progress from existing pending_onboarding rows where possible.
do $$
begin
  if to_regclass('public.pending_onboarding') is not null then
    insert into public.onboarding_progress (
      user_id,
      tenant_id,
      next_step,
      status,
      onboarding_complete,
      completed_steps,
      metadata,
      created_at,
      updated_at
    )
    select
      au.id,
      (to_jsonb(po) ->> 'tenant_id')::uuid,
      state.next_step,
      lower(coalesce(po.status::text, 'in_progress')),
      state.onboarding_complete,
      state.completed_steps,
      jsonb_build_object('source', 'pending_onboarding_backfill', 'backfilled_at', now()),
      now(),
      now()
    from public.pending_onboarding po
    join auth.users au
      on lower(au.email) = lower(po.email)
    cross join lateral public.compute_onboarding_state(po.status) state
    where coalesce(to_jsonb(po) ->> 'tenant_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    on conflict (user_id, tenant_id) do update
    set
      next_step = excluded.next_step,
      status = excluded.status,
      onboarding_complete = excluded.onboarding_complete,
      completed_steps = excluded.completed_steps,
      metadata = coalesce(public.onboarding_progress.metadata, '{}'::jsonb) || jsonb_build_object('source', 'pending_onboarding_backfill', 'backfilled_at', now()),
      updated_at = now();
  end if;
end;
$$;

-- Backfill onboarding_progress defaults for existing client memberships lacking explicit progress rows.
insert into public.onboarding_progress (
  user_id,
  tenant_id,
  next_step,
  status,
  onboarding_complete,
  completed_steps,
  metadata,
  created_at,
  updated_at
)
select
  m.user_id,
  m.tenant_id,
  case
    when lower(coalesce(t.status::text, '')) = 'active' then 'done'
    else 'account'
  end,
  case
    when lower(coalesce(t.status::text, '')) = 'active' then 'completed'
    else 'in_progress'
  end,
  lower(coalesce(t.status::text, '')) = 'active',
  case
    when lower(coalesce(t.status::text, '')) = 'active' then '["account","business_setup","billing","google","finish"]'::jsonb
    else '[]'::jsonb
  end,
  jsonb_build_object('source', 'membership_backfill', 'backfilled_at', now()),
  now(),
  now()
from public.memberships m
left join public.tenants t
  on t.tenant_id = m.tenant_id
where (
    coalesce(to_jsonb(m) ->> 'app_role', '') = 'client'
    or lower(coalesce(to_jsonb(m) ->> 'role', '')) in ('member', 'client')
  )
  and not exists (
    select 1
    from public.onboarding_progress op
    where op.user_id = m.user_id
      and op.tenant_id = m.tenant_id
  );

-- ---------------------------------------------------------------------------
-- Row Level Security policies
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.tenants enable row level security;
alter table public.memberships enable row level security;
alter table public.onboarding_progress enable row level security;

drop policy if exists profiles_select_self_or_admin on public.profiles;
create policy profiles_select_self_or_admin
on public.profiles
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_owner_admin(auth.uid())
);

drop policy if exists profiles_insert_self_or_admin on public.profiles;
create policy profiles_insert_self_or_admin
on public.profiles
for insert
to authenticated
with check (
  user_id = auth.uid()
  or public.is_owner_admin(auth.uid())
);

drop policy if exists profiles_update_self_or_admin on public.profiles;
create policy profiles_update_self_or_admin
on public.profiles
for update
to authenticated
using (
  user_id = auth.uid()
  or public.is_owner_admin(auth.uid())
)
with check (
  user_id = auth.uid()
  or public.is_owner_admin(auth.uid())
);

drop policy if exists tenants_select_member_or_admin on public.tenants;
create policy tenants_select_member_or_admin
on public.tenants
for select
to authenticated
using (
  public.is_owner_admin(auth.uid())
  or public.has_tenant_membership(tenant_id, auth.uid())
);

drop policy if exists tenants_mutate_owner_admin on public.tenants;
create policy tenants_mutate_owner_admin
on public.tenants
for all
to authenticated
using (public.is_owner_admin(auth.uid()))
with check (public.is_owner_admin(auth.uid()));

drop policy if exists memberships_select_self_or_admin on public.memberships;
create policy memberships_select_self_or_admin
on public.memberships
for select
to authenticated
using (
  public.is_owner_admin(auth.uid())
  or user_id = auth.uid()
);

drop policy if exists memberships_mutate_owner_admin on public.memberships;
create policy memberships_mutate_owner_admin
on public.memberships
for all
to authenticated
using (public.is_owner_admin(auth.uid()))
with check (public.is_owner_admin(auth.uid()));

drop policy if exists onboarding_progress_select_self_or_admin on public.onboarding_progress;
create policy onboarding_progress_select_self_or_admin
on public.onboarding_progress
for select
to authenticated
using (
  public.is_owner_admin(auth.uid())
  or user_id = auth.uid()
);

drop policy if exists onboarding_progress_insert_self_or_admin on public.onboarding_progress;
create policy onboarding_progress_insert_self_or_admin
on public.onboarding_progress
for insert
to authenticated
with check (
  public.is_owner_admin(auth.uid())
  or user_id = auth.uid()
);

drop policy if exists onboarding_progress_update_self_or_admin on public.onboarding_progress;
create policy onboarding_progress_update_self_or_admin
on public.onboarding_progress
for update
to authenticated
using (
  public.is_owner_admin(auth.uid())
  or user_id = auth.uid()
)
with check (
  public.is_owner_admin(auth.uid())
  or user_id = auth.uid()
);

drop policy if exists onboarding_progress_delete_owner_admin on public.onboarding_progress;
create policy onboarding_progress_delete_owner_admin
on public.onboarding_progress
for delete
to authenticated
using (public.is_owner_admin(auth.uid()));

do $$
begin
  if to_regclass('public.pending_onboarding') is not null then
    execute 'alter table public.pending_onboarding enable row level security';

    execute 'drop policy if exists pending_onboarding_admin_all on public.pending_onboarding';
    execute 'create policy pending_onboarding_admin_all on public.pending_onboarding for all to authenticated using (public.is_owner_admin(auth.uid())) with check (public.is_owner_admin(auth.uid()))';

    execute 'drop policy if exists pending_onboarding_select_self_email on public.pending_onboarding';
    execute 'create policy pending_onboarding_select_self_email on public.pending_onboarding for select to authenticated using (lower(coalesce(to_jsonb(pending_onboarding) ->> ''email'', '''')) = lower(coalesce(auth.jwt() ->> ''email'', '''')))';
  end if;
end;
$$;

grant select, insert, update on public.profiles to authenticated;
grant select on public.tenants to authenticated;
grant select on public.memberships to authenticated;
grant select, insert, update on public.onboarding_progress to authenticated;

commit;

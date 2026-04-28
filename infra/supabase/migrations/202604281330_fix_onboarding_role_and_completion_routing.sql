-- Keep client onboarding users out of owner/admin routing, and only route
-- clients to the dashboard after billing, GBP, and business info are present.

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
          or (
            coalesce(to_jsonb(m) ->> 'app_role', '') = ''
            and lower(coalesce(to_jsonb(m) ->> 'role', '')) in ('owner_admin', 'admin', 'super_admin', 'superadmin', 'staff')
          )
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
  v_onboarding_complete boolean := false;
  v_next_step text;
  v_status text;
  v_tenant_active boolean := false;
  v_billing_active boolean := false;
  v_has_connected_gbp boolean := false;
  v_has_business_info boolean := false;
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

  if v_next_step is null and to_regclass('public.pending_onboarding') is not null then
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
        v_onboarding_complete := false;
        v_next_step := null;
        v_status := null;
    end;
  end if;

  if to_regclass('public.tenants') is not null then
    select
      lower(coalesce(t.status::text, '')) = 'active',
      length(trim(coalesce(t.business_name, ''))) > 1
        and lower(trim(coalesce(t.business_name, ''))) <> 'new client'
    into v_tenant_active, v_has_business_info
    from public.tenants t
    where t.tenant_id = v_tenant
    limit 1;
  end if;

  if to_regclass('public.billing_subscriptions') is not null then
    select exists (
      select 1
      from public.billing_subscriptions bs
      where bs.tenant_id = v_tenant
        and lower(coalesce(bs.status::text, '')) in ('active', 'trialing')
    )
    into v_billing_active;
  end if;

  if to_regclass('public.connected_accounts') is not null then
    select exists (
      select 1
      from public.connected_accounts ca
      where coalesce(to_jsonb(ca) ->> 'tenant_id', to_jsonb(ca) ->> 'organization_id', '') = v_tenant::text
      limit 1
    )
    into v_has_connected_gbp;
  end if;

  if not coalesce(v_has_connected_gbp, false) and to_regclass('public.locations') is not null then
    select exists (
      select 1
      from public.locations l
      where coalesce(to_jsonb(l) ->> 'tenant_id', to_jsonb(l) ->> 'organization_id', '') = v_tenant::text
        and coalesce(to_jsonb(l) ->> 'google_location_id', '') <> ''
      limit 1
    )
    into v_has_connected_gbp;
  end if;

  if not coalesce(v_has_connected_gbp, false) and to_regclass('public.gbp_connections') is not null then
    select exists (
      select 1
      from public.gbp_connections gc
      where coalesce(to_jsonb(gc) ->> 'tenant_id', to_jsonb(gc) ->> 'organization_id', '') = v_tenant::text
        and lower(coalesce(gc.status::text, '')) = 'connected'
      limit 1
    )
    into v_has_connected_gbp;
  end if;

  v_onboarding_complete :=
    coalesce(v_billing_active, false)
    and coalesce(v_has_connected_gbp, false)
    and coalesce(v_has_business_info, false);

  if v_onboarding_complete then
    v_next_step := 'done';
    v_status := 'completed';
  elsif not coalesce(v_has_connected_gbp, false) then
    v_next_step := coalesce(v_next_step, 'account');
    v_status := coalesce(v_status, 'in_progress');
  elsif not coalesce(v_has_business_info, false) then
    v_next_step := 'business_setup';
    v_status := coalesce(v_status, 'business_setup');
  elsif not coalesce(v_billing_active, false) then
    v_next_step := 'billing';
    v_status := coalesce(v_status, 'stripe_pending');
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
        'billing_active', coalesce(v_billing_active, false),
        'has_connected_gbp', coalesce(v_has_connected_gbp, false),
        'has_business_info', coalesce(v_has_business_info, false)
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
      'billing_active', coalesce(v_billing_active, false),
      'has_connected_gbp', coalesce(v_has_connected_gbp, false),
      'has_business_info', coalesce(v_has_business_info, false)
    );
end;
$$;

revoke all on function public.resolve_post_login_destination() from public;
grant execute on function public.resolve_post_login_destination() to authenticated;
grant execute on function public.resolve_post_login_destination() to service_role;

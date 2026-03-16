begin;

create or replace function public.cancel_onboarding_invite_and_purge(p_email text)
returns table(
  canceled boolean,
  resend_ready boolean,
  message text,
  deleted_auth_users integer,
  deleted_public_rows integer
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_user_ids uuid[] := '{}'::uuid[];
  v_tenant_ids uuid[] := '{}'::uuid[];
  v_profile_tenant_ids uuid[] := '{}'::uuid[];
  v_has_pending boolean := false;
  v_has_completed boolean := false;
  v_rows integer := 0;
  v_public_deleted integer := 0;
  v_auth_deleted integer := 0;
  v_table record;
begin
  if v_email = '' then
    raise exception 'email is required';
  end if;

  if to_regclass('public.pending_onboarding') is not null then
    execute $sql$
      select exists(
        select 1
        from public.pending_onboarding po
        where lower(coalesce(to_jsonb(po) ->> 'email', '')) = $1
      )
    $sql$
    into v_has_pending
    using v_email;

    execute $sql$
      select exists(
        select 1
        from public.pending_onboarding po
        where lower(coalesce(to_jsonb(po) ->> 'email', '')) = $1
          and lower(coalesce(to_jsonb(po) ->> 'status', '')) in ('completed', 'activated')
      )
    $sql$
    into v_has_completed
    using v_email;
  end if;

  select coalesce(array_agg(u.id), '{}'::uuid[])
  into v_user_ids
  from auth.users u
  where lower(coalesce(u.email, '')) = v_email;

  if not v_has_completed
     and coalesce(array_length(v_user_ids, 1), 0) > 0
     and to_regclass('public.onboarding_progress') is not null then
    select exists(
      select 1
      from public.onboarding_progress op
      where op.user_id = any(v_user_ids)
        and (
          coalesce(op.onboarding_complete, false)
          or lower(coalesce(op.status, '')) in ('completed', 'activated')
        )
    )
    into v_has_completed;
  end if;

  if not v_has_completed
     and coalesce(array_length(v_user_ids, 1), 0) > 0
     and to_regclass('public.memberships') is not null
     and to_regclass('public.tenants') is not null then
    select exists(
      select 1
      from public.memberships m
      join public.tenants t on t.tenant_id = m.tenant_id
      where m.user_id = any(v_user_ids)
        and lower(coalesce(t.status::text, '')) in ('active', 'completed', 'activated')
    )
    into v_has_completed;
  end if;

  if v_has_completed then
    return query
    select false, false, 'Invite cannot be canceled after onboarding is complete.', 0, 0;
    return;
  end if;

  if coalesce(array_length(v_user_ids, 1), 0) = 0 and not v_has_pending then
    return query
    select false, false, 'No pending invite found for this email.', 0, 0;
    return;
  end if;

  if to_regclass('public.pending_onboarding') is not null then
    execute $sql$
      with pending_tenants as (
        select nullif(coalesce(to_jsonb(po) ->> 'tenant_id', ''), '') as tenant_id_text
        from public.pending_onboarding po
        where lower(coalesce(to_jsonb(po) ->> 'email', '')) = $1
      )
      select coalesce(array_agg(distinct tenant_id_text::uuid), '{}'::uuid[])
      from pending_tenants
      where tenant_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    $sql$
    into v_tenant_ids
    using v_email;
  end if;

  if coalesce(array_length(v_user_ids, 1), 0) > 0 and to_regclass('public.memberships') is not null then
    v_tenant_ids := v_tenant_ids || coalesce((
      select array_agg(distinct m.tenant_id)
      from public.memberships m
      where m.user_id = any(v_user_ids)
        and m.tenant_id is not null
    ), '{}'::uuid[]);
  end if;

  if coalesce(array_length(v_user_ids, 1), 0) > 0 and to_regclass('public.onboarding_progress') is not null then
    v_tenant_ids := v_tenant_ids || coalesce((
      select array_agg(distinct op.tenant_id)
      from public.onboarding_progress op
      where op.user_id = any(v_user_ids)
        and op.tenant_id is not null
    ), '{}'::uuid[]);
  end if;

  if coalesce(array_length(v_user_ids, 1), 0) > 0 and to_regclass('public.profiles') is not null then
    execute $sql$
      with profile_tenants as (
        select nullif(coalesce(to_jsonb(p) ->> 'tenant_id', ''), '') as tenant_id_text
        from public.profiles p
        where p.user_id = any($1)
        union all
        select nullif(coalesce(to_jsonb(p) ->> 'default_tenant_id', ''), '') as tenant_id_text
        from public.profiles p
        where p.user_id = any($1)
      )
      select coalesce(array_agg(distinct tenant_id_text::uuid), '{}'::uuid[])
      from profile_tenants
      where tenant_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    $sql$
    into v_profile_tenant_ids
    using v_user_ids;

    v_tenant_ids := v_tenant_ids || v_profile_tenant_ids;
  end if;

  if coalesce(array_length(v_tenant_ids, 1), 0) > 0 then
    select coalesce(array_agg(distinct tenant_id), '{}'::uuid[])
    into v_tenant_ids
    from unnest(v_tenant_ids) as tenant_id;
  end if;

  -- Pass 1: clear rows by matching email.
  for v_table in
    select c.table_schema, c.table_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema
     and t.table_name = c.table_name
    where c.table_schema = 'public'
      and c.column_name = 'email'
      and c.udt_name in ('text', 'varchar', 'bpchar', 'citext')
      and t.table_type = 'BASE TABLE'
    group by c.table_schema, c.table_name
  loop
    execute format('delete from %I.%I where lower(coalesce(email, '''')) = $1', v_table.table_schema, v_table.table_name)
    using v_email;
    get diagnostics v_rows = row_count;
    v_public_deleted := v_public_deleted + v_rows;
  end loop;

  -- Pass 2: clear rows by user_id.
  if coalesce(array_length(v_user_ids, 1), 0) > 0 then
    for v_table in
      select c.table_schema, c.table_name
      from information_schema.columns c
      join information_schema.tables t
        on t.table_schema = c.table_schema
       and t.table_name = c.table_name
      where c.table_schema = 'public'
        and c.column_name = 'user_id'
        and c.udt_name = 'uuid'
        and t.table_type = 'BASE TABLE'
      group by c.table_schema, c.table_name
    loop
      execute format('delete from %I.%I where user_id = any($1)', v_table.table_schema, v_table.table_name)
      using v_user_ids;
      get diagnostics v_rows = row_count;
      v_public_deleted := v_public_deleted + v_rows;
    end loop;
  end if;

  -- Pass 3: clear rows by tenant_id.
  if coalesce(array_length(v_tenant_ids, 1), 0) > 0 then
    for v_table in
      select c.table_schema, c.table_name
      from information_schema.columns c
      join information_schema.tables t
        on t.table_schema = c.table_schema
       and t.table_name = c.table_name
      where c.table_schema = 'public'
        and c.column_name = 'tenant_id'
        and c.udt_name = 'uuid'
        and t.table_type = 'BASE TABLE'
      group by c.table_schema, c.table_name
    loop
      execute format('delete from %I.%I where tenant_id = any($1)', v_table.table_schema, v_table.table_name)
      using v_tenant_ids;
      get diagnostics v_rows = row_count;
      v_public_deleted := v_public_deleted + v_rows;
    end loop;
  end if;

  -- Compatibility cleanup for legacy users table keyed by id.
  if coalesce(array_length(v_user_ids, 1), 0) > 0 and to_regclass('public.users') is not null then
    execute 'delete from public.users where id = any($1)'
    using v_user_ids;
    get diagnostics v_rows = row_count;
    v_public_deleted := v_public_deleted + v_rows;
  end if;

  -- Remove Supabase auth users last so profile/membership cascading cleanup has already happened.
  if coalesce(array_length(v_user_ids, 1), 0) > 0 then
    delete from auth.users u
    where u.id = any(v_user_ids);
    get diagnostics v_auth_deleted = row_count;
  end if;

  return query
  select true, true, 'Invite canceled and onboarding data removed.', v_auth_deleted, v_public_deleted;
end;
$$;

commit;

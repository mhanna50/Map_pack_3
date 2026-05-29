-- Integration Health & Recovery data model.

create table if not exists public.integration_health_checks (
  id uuid primary key,
  tenant_id uuid references public.organizations(id),
  integration varchar(80) not null,
  module varchar(120),
  status varchar(32) not null,
  severity varchar(16) not null,
  category varchar(64),
  message text not null,
  safe_details jsonb,
  last_checked_at timestamptz,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  failure_count integer not null default 0,
  recovery_attempt_count integer not null default 0,
  next_retry_at timestamptz,
  is_user_action_required boolean not null default false,
  user_action_type varchar(64),
  admin_action_required boolean not null default false,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_integration_health_scope unique (tenant_id, integration, module)
);

create table if not exists public.integration_incidents (
  id uuid primary key,
  tenant_id uuid references public.organizations(id),
  integration varchar(80) not null,
  module varchar(120),
  severity varchar(16) not null,
  category varchar(64) not null,
  title varchar(255) not null,
  message text not null,
  safe_error_summary text,
  safe_details jsonb,
  status varchar(32) not null default 'open',
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  resolved_at timestamptz,
  recovery_attempts jsonb,
  affected_count integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.integration_recovery_attempts (
  id uuid primary key,
  tenant_id uuid references public.organizations(id),
  incident_id uuid references public.integration_incidents(id),
  integration varchar(80) not null,
  module varchar(120),
  action varchar(128) not null,
  status varchar(32) not null,
  message text,
  safe_details jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.client_reconnect_prompts (
  id uuid primary key,
  tenant_id uuid not null references public.organizations(id),
  integration varchar(80) not null,
  module varchar(120),
  reason text not null,
  status varchar(32) not null default 'active',
  action_url varchar(255),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists ix_integration_health_checks_tenant on public.integration_health_checks (tenant_id);
create index if not exists ix_integration_health_checks_integration on public.integration_health_checks (integration);
create index if not exists ix_integration_health_checks_status on public.integration_health_checks (status);
create index if not exists ix_integration_health_checks_severity on public.integration_health_checks (severity);
create index if not exists ix_integration_health_checks_next_retry on public.integration_health_checks (next_retry_at);
create index if not exists ix_integration_incidents_tenant on public.integration_incidents (tenant_id);
create index if not exists ix_integration_incidents_integration on public.integration_incidents (integration);
create index if not exists ix_integration_incidents_status on public.integration_incidents (status);
create index if not exists ix_integration_incidents_severity on public.integration_incidents (severity);
create index if not exists ix_integration_recovery_attempts_incident on public.integration_recovery_attempts (incident_id);
create index if not exists ix_client_reconnect_prompts_tenant on public.client_reconnect_prompts (tenant_id);
create index if not exists ix_client_reconnect_prompts_status on public.client_reconnect_prompts (status);

alter table public.integration_health_checks enable row level security;
alter table public.integration_incidents enable row level security;
alter table public.integration_recovery_attempts enable row level security;
alter table public.client_reconnect_prompts enable row level security;

grant select on public.integration_health_checks, public.client_reconnect_prompts to authenticated;
revoke all on public.integration_incidents, public.integration_recovery_attempts from anon, authenticated;

drop policy if exists integration_health_checks_select_member on public.integration_health_checks;
create policy integration_health_checks_select_member
on public.integration_health_checks
for select
to authenticated
using (tenant_id is not null and public.tenant_has_access(tenant_id));

drop policy if exists client_reconnect_prompts_select_member on public.client_reconnect_prompts;
create policy client_reconnect_prompts_select_member
on public.client_reconnect_prompts
for select
to authenticated
using (public.tenant_has_access(tenant_id));

drop policy if exists integration_incidents_service_only on public.integration_incidents;
create policy integration_incidents_service_only
on public.integration_incidents
as restrictive
for all
using (false)
with check (false);

drop policy if exists integration_recovery_attempts_service_only on public.integration_recovery_attempts;
create policy integration_recovery_attempts_service_only
on public.integration_recovery_attempts
as restrictive
for all
using (false)
with check (false);

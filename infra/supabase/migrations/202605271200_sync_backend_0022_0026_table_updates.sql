-- Sync Supabase schema with backend migrations 0022 through 0026.

do $$
begin
  create type public.review_provider as enum (
    'google',
    'yelp',
    'facebook',
    'tripadvisor',
    'trustpilot',
    'bbb',
    'angi',
    'nextdoor',
    'healthgrades',
    'opentable'
  );
exception when duplicate_object then null;
end $$;

alter table if exists public.reviews
  add column if not exists provider public.review_provider not null default 'google',
  add column if not exists source_url varchar;

create index if not exists ix_review_provider on public.reviews (provider);
create unique index if not exists uq_review_provider_external_id on public.reviews (provider, external_review_id);

create table if not exists public.lead_recovery_settings (
  id uuid primary key,
  tenant_id uuid not null references public.organizations(id),
  enabled boolean not null default false,
  business_phone varchar(32),
  owner_notification_phone varchar(32),
  owner_notification_email varchar(320),
  twilio_phone_number varchar(32),
  twilio_phone_sid varchar(128),
  forwarding_status varchar(32) not null default 'not_configured',
  missed_call_textback_enabled boolean not null default true,
  intake_questions_enabled boolean not null default true,
  owner_notifications_enabled boolean not null default true,
  no_response_followup_enabled boolean not null default true,
  completed_job_review_request_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_lead_recovery_settings_tenant unique (tenant_id)
);

create table if not exists public.leads (
  id uuid primary key,
  tenant_id uuid not null references public.organizations(id),
  source varchar(32) not null default 'missed_call',
  customer_name varchar(255),
  customer_phone varchar(32),
  customer_email varchar(320),
  service_requested varchar(255),
  location varchar(255),
  urgency varchar(120),
  preferred_time varchar(255),
  details text,
  status varchar(32) not null default 'new',
  owner_summary text,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lead_messages (
  id uuid primary key,
  tenant_id uuid not null references public.organizations(id),
  lead_id uuid not null references public.leads(id) on delete cascade,
  direction varchar(24) not null,
  channel varchar(24) not null,
  body text,
  twilio_message_sid varchar(128),
  created_at timestamptz not null default now()
);

create table if not exists public.lead_notes (
  id uuid primary key,
  tenant_id uuid not null references public.organizations(id),
  lead_id uuid not null references public.leads(id) on delete cascade,
  note text not null,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.lead_events (
  id uuid primary key,
  tenant_id uuid not null references public.organizations(id),
  lead_id uuid references public.leads(id) on delete cascade,
  event_type varchar(64) not null,
  payload_json jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ix_lead_recovery_settings_twilio_phone on public.lead_recovery_settings (twilio_phone_number);
create index if not exists ix_lead_recovery_settings_twilio_sid on public.lead_recovery_settings (twilio_phone_sid);
create index if not exists ix_leads_tenant_status on public.leads (tenant_id, status);
create index if not exists ix_leads_tenant_phone on public.leads (tenant_id, customer_phone);
create index if not exists ix_lead_messages_tenant_lead on public.lead_messages (tenant_id, lead_id);
create index if not exists ix_lead_messages_twilio_sid on public.lead_messages (twilio_message_sid);
create index if not exists ix_lead_notes_tenant_lead on public.lead_notes (tenant_id, lead_id);
create index if not exists ix_lead_events_tenant_lead on public.lead_events (tenant_id, lead_id);
create index if not exists ix_lead_events_type on public.lead_events (event_type);

alter table public.lead_recovery_settings enable row level security;
alter table public.leads enable row level security;
alter table public.lead_messages enable row level security;
alter table public.lead_notes enable row level security;
alter table public.lead_events enable row level security;

drop policy if exists tenant_isolation on public.lead_recovery_settings;
create policy tenant_isolation on public.lead_recovery_settings
  using (tenant_id = nullif(current_setting('app.current_org', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.current_org', true), '')::uuid);

drop policy if exists tenant_isolation on public.leads;
create policy tenant_isolation on public.leads
  using (tenant_id = nullif(current_setting('app.current_org', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.current_org', true), '')::uuid);

drop policy if exists tenant_isolation on public.lead_messages;
create policy tenant_isolation on public.lead_messages
  using (tenant_id = nullif(current_setting('app.current_org', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.current_org', true), '')::uuid);

drop policy if exists tenant_isolation on public.lead_notes;
create policy tenant_isolation on public.lead_notes
  using (tenant_id = nullif(current_setting('app.current_org', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.current_org', true), '')::uuid);

drop policy if exists tenant_isolation on public.lead_events;
create policy tenant_isolation on public.lead_events
  using (tenant_id = nullif(current_setting('app.current_org', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.current_org', true), '')::uuid);

create table if not exists public.client_activity_events (
  id uuid primary key,
  tenant_id uuid not null references public.organizations(id),
  module varchar(64) not null,
  event_type varchar(128) not null,
  status varchar(32),
  title varchar(255),
  description text,
  metadata_json jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_client_notes (
  id uuid primary key,
  tenant_id uuid not null references public.organizations(id),
  note text not null,
  created_by uuid,
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_impersonation_audit (
  id uuid primary key,
  admin_user_id uuid not null,
  target_user_id uuid,
  tenant_id uuid not null references public.organizations(id),
  action varchar(32) not null,
  metadata_json jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ix_client_activity_events_tenant_module on public.client_activity_events (tenant_id, module);
create index if not exists ix_client_activity_events_created_at on public.client_activity_events (created_at);
create index if not exists ix_admin_client_notes_tenant on public.admin_client_notes (tenant_id);
create index if not exists ix_admin_impersonation_audit_tenant on public.admin_impersonation_audit (tenant_id);
create index if not exists ix_admin_impersonation_audit_admin on public.admin_impersonation_audit (admin_user_id);

alter table public.client_activity_events enable row level security;
alter table public.admin_client_notes enable row level security;
alter table public.admin_impersonation_audit enable row level security;

drop policy if exists tenant_isolation on public.client_activity_events;
create policy tenant_isolation on public.client_activity_events
  using (tenant_id = nullif(current_setting('app.current_org', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.current_org', true), '')::uuid);

drop policy if exists tenant_isolation on public.admin_client_notes;
create policy tenant_isolation on public.admin_client_notes
  using (tenant_id = nullif(current_setting('app.current_org', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.current_org', true), '')::uuid);

drop policy if exists admin_impersonation_audit_service_only on public.admin_impersonation_audit;
create policy admin_impersonation_audit_service_only on public.admin_impersonation_audit
  as restrictive
  using (false)
  with check (false);

alter table public.lead_recovery_settings
  add column if not exists business_name varchar(255),
  add column if not exists verification_status varchar(32) not null default 'not_started',
  add column if not exists last_verification_attempt_at timestamptz,
  add column if not exists verified_at timestamptz,
  add column if not exists test_call_from_phone varchar(32),
  add column if not exists last_test_call_sid varchar(128),
  add column if not exists consent_confirmed boolean not null default false;

create index if not exists ix_lead_recovery_settings_tenant on public.lead_recovery_settings (tenant_id);
create index if not exists ix_leads_created_at on public.leads (created_at);
create index if not exists ix_lead_messages_lead on public.lead_messages (lead_id);
create unique index if not exists uq_lead_recovery_settings_twilio_phone_not_null on public.lead_recovery_settings (twilio_phone_number) where twilio_phone_number is not null;
create unique index if not exists uq_lead_recovery_settings_twilio_sid_not_null on public.lead_recovery_settings (twilio_phone_sid) where twilio_phone_sid is not null;
create unique index if not exists uq_lead_messages_twilio_sid_not_null on public.lead_messages (twilio_message_sid) where twilio_message_sid is not null;

create table if not exists public.admin_finance_settings (
  id boolean primary key default true,
  pa_income_tax_rate numeric(8,6) not null default 0.030700,
  federal_income_tax_rate numeric(8,6) not null default 0,
  self_employment_tax_rate numeric(8,6) not null default 0.153000,
  self_employment_taxable_ratio numeric(8,6) not null default 0.923500,
  local_tax_rate numeric(8,6) not null default 0,
  additional_tax_rate numeric(8,6) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_finance_settings_singleton check (id = true)
);

insert into public.admin_finance_settings (id)
values (true)
on conflict (id) do nothing;

create table if not exists public.admin_business_expenses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  amount_cents integer not null check (amount_cents >= 0),
  expense_type text not null default 'one_time' check (expense_type in ('one_time', 'recurring')),
  recurrence_interval text check (recurrence_interval is null or recurrence_interval in ('monthly', 'quarterly', 'yearly')),
  occurred_on date not null default current_date,
  starts_on date,
  ends_on date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ix_admin_business_expenses_occurred_on on public.admin_business_expenses (occurred_on);
create index if not exists ix_admin_business_expenses_type on public.admin_business_expenses (expense_type);
create index if not exists ix_admin_business_expenses_category on public.admin_business_expenses (category);

create table if not exists public.client_revenue_ledger (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(tenant_id) on delete set null,
  client_name text,
  stripe_subscription_id text,
  plan text,
  status text,
  amount_cents integer not null default 0 check (amount_cents >= 0),
  currency text not null default 'usd',
  period_month date not null,
  source text not null default 'subscription_snapshot',
  ledger_key text,
  occurred_at timestamptz not null default now(),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.client_revenue_ledger add column if not exists ledger_key text;

create unique index if not exists uq_client_revenue_ledger_month_subscription
on public.client_revenue_ledger (
  period_month,
  coalesce(stripe_subscription_id, ''),
  coalesce(tenant_id::text, ''),
  source
);
drop index if exists public.uq_client_revenue_ledger_key;
create unique index if not exists uq_client_revenue_ledger_key on public.client_revenue_ledger (ledger_key);
create index if not exists ix_client_revenue_ledger_tenant on public.client_revenue_ledger (tenant_id);
create index if not exists ix_client_revenue_ledger_period on public.client_revenue_ledger (period_month);
create index if not exists ix_client_revenue_ledger_status on public.client_revenue_ledger (status);

alter table public.admin_finance_settings enable row level security;
alter table public.admin_business_expenses enable row level security;
alter table public.client_revenue_ledger enable row level security;

drop policy if exists admin_finance_settings_admin_all on public.admin_finance_settings;
create policy admin_finance_settings_admin_all
on public.admin_finance_settings
for all
to authenticated
using (public.is_owner_admin(auth.uid()))
with check (public.is_owner_admin(auth.uid()));

drop policy if exists admin_business_expenses_admin_all on public.admin_business_expenses;
create policy admin_business_expenses_admin_all
on public.admin_business_expenses
for all
to authenticated
using (public.is_owner_admin(auth.uid()))
with check (public.is_owner_admin(auth.uid()));

drop policy if exists client_revenue_ledger_admin_all on public.client_revenue_ledger;
create policy client_revenue_ledger_admin_all
on public.client_revenue_ledger
for all
to authenticated
using (public.is_owner_admin(auth.uid()))
with check (public.is_owner_admin(auth.uid()));

drop policy if exists admin_finance_settings_service_all on public.admin_finance_settings;
create policy admin_finance_settings_service_all
on public.admin_finance_settings
for all
to service_role
using (true)
with check (true);

drop policy if exists admin_business_expenses_service_all on public.admin_business_expenses;
create policy admin_business_expenses_service_all
on public.admin_business_expenses
for all
to service_role
using (true)
with check (true);

drop policy if exists client_revenue_ledger_service_all on public.client_revenue_ledger;
create policy client_revenue_ledger_service_all
on public.client_revenue_ledger
for all
to service_role
using (true)
with check (true);

grant select, insert, update, delete on public.admin_business_expenses to authenticated;
grant select, update on public.admin_finance_settings to authenticated;
grant select on public.client_revenue_ledger to authenticated;
grant select, insert, update, delete on public.admin_business_expenses to service_role;
grant select, insert, update on public.admin_finance_settings to service_role;
grant select, insert, update, delete on public.client_revenue_ledger to service_role;

-- Client support tickets.

create table if not exists public.support_tickets (
  id uuid primary key,
  tenant_id uuid not null references public.organizations(id),
  subject varchar(255) not null,
  description text,
  status varchar(32) not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ix_support_tickets_tenant on public.support_tickets (tenant_id);
create index if not exists ix_support_tickets_status on public.support_tickets (status);
create index if not exists ix_support_tickets_created_at on public.support_tickets (created_at);

alter table public.support_tickets enable row level security;

grant select on public.support_tickets to authenticated;
revoke all on public.support_tickets from anon;

drop policy if exists support_tickets_select_member on public.support_tickets;
create policy support_tickets_select_member
on public.support_tickets
for select
to authenticated
using (tenant_id is not null and public.tenant_has_access(tenant_id));

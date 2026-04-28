create table if not exists public.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now(),
  metadata_json jsonb not null default '{}'::jsonb
);

revoke all on public.stripe_webhook_events from anon, authenticated;

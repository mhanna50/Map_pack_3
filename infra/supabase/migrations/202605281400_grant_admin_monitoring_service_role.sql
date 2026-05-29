-- Allow the admin dashboard service client to read monitoring source tables.
-- Client access remains governed by each table's existing RLS policies.

grant usage on schema public to service_role;

grant select on table
  public.tenants,
  public.organizations,
  public.billing_subscriptions,
  public.lead_recovery_settings,
  public.gbp_connections,
  public.locations,
  public.lead_events,
  public.leads,
  public.lead_messages,
  public.lead_notes,
  public.post_history,
  public.listing_audits,
  public.reviews,
  public.review_requests,
  public.media_upload_requests,
  public.qna_entries,
  public.rank_snapshots,
  public.client_activity_events,
  public.jobs,
  public.alerts,
  public.integration_health_checks,
  public.integration_incidents,
  public.integration_recovery_attempts,
  public.client_reconnect_prompts,
  public.support_tickets,
  public.pending_onboarding,
  public.admin_client_notes,
  public.admin_impersonation_audit
to service_role;

grant insert, update on table
  public.admin_client_notes,
  public.admin_impersonation_audit,
  public.integration_health_checks,
  public.integration_incidents,
  public.integration_recovery_attempts,
  public.client_reconnect_prompts
to service_role;

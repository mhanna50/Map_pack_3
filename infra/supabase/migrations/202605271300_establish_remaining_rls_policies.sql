-- Establish RLS policies for tables that were created before the Supabase
-- policy hardening migrations covered the full backend schema.

-- Server-owned tables. These are accessed through backend/service-role code,
-- not directly through Supabase client sessions.
alter table if exists public.users enable row level security;
revoke all on public.users from anon, authenticated;
drop policy if exists users_service_only on public.users;
create policy users_service_only
on public.users
as restrictive
for all
using (false)
with check (false);

alter table if exists public.stripe_webhook_events enable row level security;
revoke all on public.stripe_webhook_events from anon, authenticated;
drop policy if exists stripe_webhook_events_service_only on public.stripe_webhook_events;
create policy stripe_webhook_events_service_only
on public.stripe_webhook_events
as restrictive
for all
using (false)
with check (false);

-- Tenant-owned Google Business, listing audit, and rank-tracking tables.
-- Authenticated tenant members can read their organization's rows. Mutations
-- require an admin role for the same organization and are still not granted
-- unless a future feature explicitly needs direct client writes.
grant select on
  public.business_services,
  public.listing_audit_items,
  public.keyword_campaign_cycles,
  public.campaign_job_runs,
  public.keyword_candidates,
  public.keyword_dashboard_aggregates,
  public.keyword_scores,
  public.selected_keywords,
  public.gbp_optimization_actions,
  public.gbp_post_keyword_mappings,
  public.geo_grid_scans,
  public.geo_grid_scan_points
to authenticated;

revoke all on
  public.business_services,
  public.listing_audit_items,
  public.keyword_campaign_cycles,
  public.campaign_job_runs,
  public.keyword_candidates,
  public.keyword_dashboard_aggregates,
  public.keyword_scores,
  public.selected_keywords,
  public.gbp_optimization_actions,
  public.gbp_post_keyword_mappings,
  public.geo_grid_scans,
  public.geo_grid_scan_points
from anon;

alter table if exists public.business_services enable row level security;
drop policy if exists business_services_select_member on public.business_services;
create policy business_services_select_member
on public.business_services
for select
to authenticated
using (public.tenant_has_access(organization_id));

drop policy if exists business_services_insert_admin on public.business_services;
create policy business_services_insert_admin
on public.business_services
for insert
to authenticated
with check (public.user_is_admin(organization_id));

drop policy if exists business_services_update_admin on public.business_services;
create policy business_services_update_admin
on public.business_services
for update
to authenticated
using (public.user_is_admin(organization_id))
with check (public.user_is_admin(organization_id));

drop policy if exists business_services_delete_admin on public.business_services;
create policy business_services_delete_admin
on public.business_services
for delete
to authenticated
using (public.user_is_admin(organization_id));

alter table if exists public.listing_audit_items enable row level security;
drop policy if exists listing_audit_items_select_member on public.listing_audit_items;
create policy listing_audit_items_select_member
on public.listing_audit_items
for select
to authenticated
using (public.tenant_has_access(tenant_id));

drop policy if exists listing_audit_items_insert_admin on public.listing_audit_items;
create policy listing_audit_items_insert_admin
on public.listing_audit_items
for insert
to authenticated
with check (public.user_is_admin(tenant_id));

drop policy if exists listing_audit_items_update_admin on public.listing_audit_items;
create policy listing_audit_items_update_admin
on public.listing_audit_items
for update
to authenticated
using (public.user_is_admin(tenant_id))
with check (public.user_is_admin(tenant_id));

drop policy if exists listing_audit_items_delete_admin on public.listing_audit_items;
create policy listing_audit_items_delete_admin
on public.listing_audit_items
for delete
to authenticated
using (public.user_is_admin(tenant_id));

alter table if exists public.keyword_campaign_cycles enable row level security;
drop policy if exists keyword_campaign_cycles_select_member on public.keyword_campaign_cycles;
create policy keyword_campaign_cycles_select_member
on public.keyword_campaign_cycles
for select
to authenticated
using (public.tenant_has_access(organization_id));

drop policy if exists keyword_campaign_cycles_insert_admin on public.keyword_campaign_cycles;
create policy keyword_campaign_cycles_insert_admin
on public.keyword_campaign_cycles
for insert
to authenticated
with check (public.user_is_admin(organization_id));

drop policy if exists keyword_campaign_cycles_update_admin on public.keyword_campaign_cycles;
create policy keyword_campaign_cycles_update_admin
on public.keyword_campaign_cycles
for update
to authenticated
using (public.user_is_admin(organization_id))
with check (public.user_is_admin(organization_id));

drop policy if exists keyword_campaign_cycles_delete_admin on public.keyword_campaign_cycles;
create policy keyword_campaign_cycles_delete_admin
on public.keyword_campaign_cycles
for delete
to authenticated
using (public.user_is_admin(organization_id));

alter table if exists public.campaign_job_runs enable row level security;
drop policy if exists campaign_job_runs_select_member on public.campaign_job_runs;
create policy campaign_job_runs_select_member
on public.campaign_job_runs
for select
to authenticated
using (public.tenant_has_access(organization_id));

drop policy if exists campaign_job_runs_insert_admin on public.campaign_job_runs;
create policy campaign_job_runs_insert_admin
on public.campaign_job_runs
for insert
to authenticated
with check (public.user_is_admin(organization_id));

drop policy if exists campaign_job_runs_update_admin on public.campaign_job_runs;
create policy campaign_job_runs_update_admin
on public.campaign_job_runs
for update
to authenticated
using (public.user_is_admin(organization_id))
with check (public.user_is_admin(organization_id));

drop policy if exists campaign_job_runs_delete_admin on public.campaign_job_runs;
create policy campaign_job_runs_delete_admin
on public.campaign_job_runs
for delete
to authenticated
using (public.user_is_admin(organization_id));

alter table if exists public.keyword_candidates enable row level security;
drop policy if exists keyword_candidates_select_member on public.keyword_candidates;
create policy keyword_candidates_select_member
on public.keyword_candidates
for select
to authenticated
using (public.tenant_has_access(organization_id));

drop policy if exists keyword_candidates_insert_admin on public.keyword_candidates;
create policy keyword_candidates_insert_admin
on public.keyword_candidates
for insert
to authenticated
with check (public.user_is_admin(organization_id));

drop policy if exists keyword_candidates_update_admin on public.keyword_candidates;
create policy keyword_candidates_update_admin
on public.keyword_candidates
for update
to authenticated
using (public.user_is_admin(organization_id))
with check (public.user_is_admin(organization_id));

drop policy if exists keyword_candidates_delete_admin on public.keyword_candidates;
create policy keyword_candidates_delete_admin
on public.keyword_candidates
for delete
to authenticated
using (public.user_is_admin(organization_id));

alter table if exists public.keyword_dashboard_aggregates enable row level security;
drop policy if exists keyword_dashboard_aggregates_select_member on public.keyword_dashboard_aggregates;
create policy keyword_dashboard_aggregates_select_member
on public.keyword_dashboard_aggregates
for select
to authenticated
using (public.tenant_has_access(organization_id));

drop policy if exists keyword_dashboard_aggregates_insert_admin on public.keyword_dashboard_aggregates;
create policy keyword_dashboard_aggregates_insert_admin
on public.keyword_dashboard_aggregates
for insert
to authenticated
with check (public.user_is_admin(organization_id));

drop policy if exists keyword_dashboard_aggregates_update_admin on public.keyword_dashboard_aggregates;
create policy keyword_dashboard_aggregates_update_admin
on public.keyword_dashboard_aggregates
for update
to authenticated
using (public.user_is_admin(organization_id))
with check (public.user_is_admin(organization_id));

drop policy if exists keyword_dashboard_aggregates_delete_admin on public.keyword_dashboard_aggregates;
create policy keyword_dashboard_aggregates_delete_admin
on public.keyword_dashboard_aggregates
for delete
to authenticated
using (public.user_is_admin(organization_id));

alter table if exists public.keyword_scores enable row level security;
drop policy if exists keyword_scores_select_member on public.keyword_scores;
create policy keyword_scores_select_member
on public.keyword_scores
for select
to authenticated
using (public.tenant_has_access(organization_id));

drop policy if exists keyword_scores_insert_admin on public.keyword_scores;
create policy keyword_scores_insert_admin
on public.keyword_scores
for insert
to authenticated
with check (public.user_is_admin(organization_id));

drop policy if exists keyword_scores_update_admin on public.keyword_scores;
create policy keyword_scores_update_admin
on public.keyword_scores
for update
to authenticated
using (public.user_is_admin(organization_id))
with check (public.user_is_admin(organization_id));

drop policy if exists keyword_scores_delete_admin on public.keyword_scores;
create policy keyword_scores_delete_admin
on public.keyword_scores
for delete
to authenticated
using (public.user_is_admin(organization_id));

alter table if exists public.selected_keywords enable row level security;
drop policy if exists selected_keywords_select_member on public.selected_keywords;
create policy selected_keywords_select_member
on public.selected_keywords
for select
to authenticated
using (public.tenant_has_access(organization_id));

drop policy if exists selected_keywords_insert_admin on public.selected_keywords;
create policy selected_keywords_insert_admin
on public.selected_keywords
for insert
to authenticated
with check (public.user_is_admin(organization_id));

drop policy if exists selected_keywords_update_admin on public.selected_keywords;
create policy selected_keywords_update_admin
on public.selected_keywords
for update
to authenticated
using (public.user_is_admin(organization_id))
with check (public.user_is_admin(organization_id));

drop policy if exists selected_keywords_delete_admin on public.selected_keywords;
create policy selected_keywords_delete_admin
on public.selected_keywords
for delete
to authenticated
using (public.user_is_admin(organization_id));

alter table if exists public.gbp_optimization_actions enable row level security;
drop policy if exists gbp_optimization_actions_select_member on public.gbp_optimization_actions;
create policy gbp_optimization_actions_select_member
on public.gbp_optimization_actions
for select
to authenticated
using (public.tenant_has_access(organization_id));

drop policy if exists gbp_optimization_actions_insert_admin on public.gbp_optimization_actions;
create policy gbp_optimization_actions_insert_admin
on public.gbp_optimization_actions
for insert
to authenticated
with check (public.user_is_admin(organization_id));

drop policy if exists gbp_optimization_actions_update_admin on public.gbp_optimization_actions;
create policy gbp_optimization_actions_update_admin
on public.gbp_optimization_actions
for update
to authenticated
using (public.user_is_admin(organization_id))
with check (public.user_is_admin(organization_id));

drop policy if exists gbp_optimization_actions_delete_admin on public.gbp_optimization_actions;
create policy gbp_optimization_actions_delete_admin
on public.gbp_optimization_actions
for delete
to authenticated
using (public.user_is_admin(organization_id));

alter table if exists public.gbp_post_keyword_mappings enable row level security;
drop policy if exists gbp_post_keyword_mappings_select_member on public.gbp_post_keyword_mappings;
create policy gbp_post_keyword_mappings_select_member
on public.gbp_post_keyword_mappings
for select
to authenticated
using (public.tenant_has_access(organization_id));

drop policy if exists gbp_post_keyword_mappings_insert_admin on public.gbp_post_keyword_mappings;
create policy gbp_post_keyword_mappings_insert_admin
on public.gbp_post_keyword_mappings
for insert
to authenticated
with check (public.user_is_admin(organization_id));

drop policy if exists gbp_post_keyword_mappings_update_admin on public.gbp_post_keyword_mappings;
create policy gbp_post_keyword_mappings_update_admin
on public.gbp_post_keyword_mappings
for update
to authenticated
using (public.user_is_admin(organization_id))
with check (public.user_is_admin(organization_id));

drop policy if exists gbp_post_keyword_mappings_delete_admin on public.gbp_post_keyword_mappings;
create policy gbp_post_keyword_mappings_delete_admin
on public.gbp_post_keyword_mappings
for delete
to authenticated
using (public.user_is_admin(organization_id));

alter table if exists public.geo_grid_scans enable row level security;
drop policy if exists geo_grid_scans_select_member on public.geo_grid_scans;
create policy geo_grid_scans_select_member
on public.geo_grid_scans
for select
to authenticated
using (public.tenant_has_access(organization_id));

drop policy if exists geo_grid_scans_insert_admin on public.geo_grid_scans;
create policy geo_grid_scans_insert_admin
on public.geo_grid_scans
for insert
to authenticated
with check (public.user_is_admin(organization_id));

drop policy if exists geo_grid_scans_update_admin on public.geo_grid_scans;
create policy geo_grid_scans_update_admin
on public.geo_grid_scans
for update
to authenticated
using (public.user_is_admin(organization_id))
with check (public.user_is_admin(organization_id));

drop policy if exists geo_grid_scans_delete_admin on public.geo_grid_scans;
create policy geo_grid_scans_delete_admin
on public.geo_grid_scans
for delete
to authenticated
using (public.user_is_admin(organization_id));

alter table if exists public.geo_grid_scan_points enable row level security;
drop policy if exists geo_grid_scan_points_select_member on public.geo_grid_scan_points;
create policy geo_grid_scan_points_select_member
on public.geo_grid_scan_points
for select
to authenticated
using (public.tenant_has_access(organization_id));

drop policy if exists geo_grid_scan_points_insert_admin on public.geo_grid_scan_points;
create policy geo_grid_scan_points_insert_admin
on public.geo_grid_scan_points
for insert
to authenticated
with check (public.user_is_admin(organization_id));

drop policy if exists geo_grid_scan_points_update_admin on public.geo_grid_scan_points;
create policy geo_grid_scan_points_update_admin
on public.geo_grid_scan_points
for update
to authenticated
using (public.user_is_admin(organization_id))
with check (public.user_is_admin(organization_id));

drop policy if exists geo_grid_scan_points_delete_admin on public.geo_grid_scan_points;
create policy geo_grid_scan_points_delete_admin
on public.geo_grid_scan_points
for delete
to authenticated
using (public.user_is_admin(organization_id));

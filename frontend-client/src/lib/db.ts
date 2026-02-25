import { createClient } from "./supabase/client";
import { PostgrestFilterBuilder } from "@supabase/postgrest-js";

type Nullable<T> = T | null;

type Pagination = { limit?: number; offset?: number };

export async function getTenantContext() {
  const supabase = createClient();
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const userId = session?.user?.id;
  if (!userId) return { tenantId: null, profile: null, tenant: null };

  const { data: profile, error: profileError } = await supabase.from("profiles").select().eq("user_id", userId).maybeSingle();
  if (profileError) throw profileError;

  const tenantId = profile?.tenant_id ?? null;
  if (!tenantId) return { tenantId, profile, tenant: null };

  const { data: tenant, error: tenantError } = await supabase.from("tenants").select().eq("tenant_id", tenantId).maybeSingle();
  if (tenantError) throw tenantError;

  return { tenantId, profile, tenant };
}

export async function listLocations(tenantId: string) {
  const supabase = createClient();
  const { data, error } = await supabase.from("locations").select().eq("tenant_id", tenantId).order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getDashboardKpis(tenantId: string, locationId?: Nullable<string>) {
  const supabase = createClient();
  const locationFilter = (query: PostgrestFilterBuilder<any, any, any, any>) =>
    locationId ? query.eq("location_id", locationId) : query;

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const last30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const postsThisMonthPromise = locationFilter(
    supabase.from("post_history").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).gte("published_at", startOfMonth),
  );
  const scheduledPostsPromise = Promise.resolve(
    locationFilter(
      supabase.from("post_jobs").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("status", "scheduled"),
    ),
  ).catch(() => ({ count: 0 }));
  const reviewRequestsSentPromise = locationFilter(
    supabase
      .from("review_requests")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .gte("created_at", last30),
  );
  const reviewCompletionsPromise = locationFilter(
    supabase
      .from("review_requests")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "review_left")
      .gte("created_at", last30),
  );

  const [postsThisMonth, scheduledPosts, reviewRequestsSent, reviewCompletions] = await Promise.all([
    postsThisMonthPromise,
    scheduledPostsPromise,
    reviewRequestsSentPromise,
    reviewCompletionsPromise,
  ]);

  return {
    postsThisMonth: postsThisMonth.count ?? 0,
    scheduledPosts: scheduledPosts.count ?? 0,
    reviewRequestsSent: reviewRequestsSent.count ?? 0,
    reviewCompletions: reviewCompletions.count ?? 0,
  };
}

export async function listPosts(
  tenantId: string,
  locationId?: Nullable<string>,
  { limit = 20, offset = 0 }: Pagination = {},
) {
  const supabase = createClient();
  let query = supabase.from("post_history").select().eq("tenant_id", tenantId).order("published_at", { ascending: false }).limit(limit).range(offset, offset + limit - 1);
  if (locationId) query = query.eq("location_id", locationId);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function listPostJobs(tenantId: string, locationId?: Nullable<string>, { limit = 10 }: Pagination = {}) {
  const supabase = createClient();
  try {
    let query = supabase.from("post_jobs").select().eq("tenant_id", tenantId).order("scheduled_for", { ascending: true }).limit(limit);
    if (locationId) query = query.eq("location_id", locationId);
    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  } catch {
    // optional table
    return [];
  }
}

export async function listReviewRequests(
  tenantId: string,
  locationId?: Nullable<string>,
  { limit = 20, offset = 0 }: Pagination = {},
) {
  const supabase = createClient();
  let query = supabase
    .from("review_requests")
    .select()
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit)
    .range(offset, offset + limit - 1);
  if (locationId) query = query.eq("location_id", locationId);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function listContentAssets(
  tenantId: string,
  locationId?: Nullable<string>,
  { limit = 30, offset = 0 }: Pagination = {},
) {
  const supabase = createClient();
  let query = supabase
    .from("content_assets")
    .select()
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit)
    .range(offset, offset + limit - 1);
  if (locationId) query = query.eq("location_id", locationId);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function listSupportTickets(
  tenantId: string,
  { limit = 20, offset = 0 }: Pagination = {},
) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("support_tickets")
    .select()
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit)
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return data ?? [];
}

export async function getBillingSubscription(tenantId: string) {
  const supabase = createClient();
  try {
    const { data, error } = await supabase.from("billing_subscriptions").select().eq("tenant_id", tenantId).maybeSingle();
    if (error) throw error;
    return data ?? null;
  } catch {
    // Table may not exist; return null to show placeholder UI
    return null;
  }
}

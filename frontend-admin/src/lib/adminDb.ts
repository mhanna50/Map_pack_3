import { cookies } from "next/headers";
import { createClient as createServiceClient, SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export type AdminUser = { id: string; email?: string | null; role?: string | null; tenant_id?: string | null };

export async function requireAdminUser(): Promise<AdminUser> {
  const cookieStore = cookies();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      get(name) {
        return cookieStore.get(name)?.value;
      },
      set() {},
      remove() {},
    },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    throw new Error("Not authenticated");
  }

  const { data: profile } = await supabase.from("profiles").select().eq("user_id", user.id).maybeSingle();
  if (profile?.role !== "admin") {
    throw new Error("Admin role required");
  }
  return { id: user.id, email: user.email, role: profile.role, tenant_id: profile.tenant_id };
}

function getService(): SupabaseClient | null {
  if (!url || !serviceKey) return null;
  return createServiceClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// --- Onboarding helpers ---

export async function upsertPendingOnboarding(payload: {
  email: string;
  business_name: string;
  first_name: string;
  last_name: string;
  plan: string;
  location_limit: number;
  invited_by: string;
}) {
  const svc = getService();
  if (!svc) return { pending: mockPending()[0], emailed: false, inviteLink: "https://example.com/invite/mock" };

  const { data, error } = await svc
    .from("pending_onboarding")
    .upsert(
      {
        email: payload.email.toLowerCase(),
        business_name: payload.business_name,
        first_name: payload.first_name,
        last_name: payload.last_name,
        plan: payload.plan,
        location_limit: payload.location_limit,
        status: "invited",
        invited_at: new Date().toISOString(),
        invited_by_admin_user_id: payload.invited_by,
      },
      { onConflict: "email" },
    )
    .select()
    .maybeSingle();
  if (error) throw error;
  return { pending: data, emailed: true };
}

export async function listPendingOnboarding() {
  const svc = getService();
  if (!svc) return mockPending();
  const { data, error } = await svc
    .from("pending_onboarding")
    .select("*, tenants(tenant_id,status), profiles:user_id(role)")
    .order("invited_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function cancelPendingOnboarding(email: string) {
  const svc = getService();
  if (!svc) return { canceled: true };
  const { error } = await svc.from("pending_onboarding").update({ status: "canceled" }).eq("email", email.toLowerCase());
  if (error) throw error;
  return { canceled: true };
}

export async function sendSupabaseInvite(email: string, redirectTo: string) {
  const svc = getService();
  if (!svc) return { emailed: false, inviteLink: "https://example.com/invite/mock" };
  const { data, error } = await svc.auth.admin.inviteUserByEmail(email, { redirectTo });
  if (error) throw error;
  return { emailed: true, inviteLink: data?.action_link ?? null };
}

export async function fetchKpis() {
  const svc = getService();
  if (!svc) return mockKpis();

  const now = new Date();
  const last30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [tenants, churned, posts, reviews] = await Promise.all([
    svc.from("tenants").select("tenant_id", { count: "exact", head: true }).eq("status", "active"),
    svc.from("tenants").select("tenant_id", { count: "exact", head: true }).eq("status", "churned").gte("created_at", last30),
    svc.from("post_history").select("id", { count: "exact", head: true }).gte("published_at", last30),
    svc.from("review_requests").select("id", { count: "exact", head: true }).gte("created_at", last30),
  ]);

  return {
    activeTenants: tenants.count ?? 0,
    churned30d: churned.count ?? 0,
    posts30d: posts.count ?? 0,
    reviews30d: reviews.count ?? 0,
    failedJobs: 0,
    mrr: null,
    trend: 3,
  };
}

export async function fetchTenants(params: { page?: number; pageSize?: number; status?: string; plan?: string; q?: string }) {
  const { page = 1, pageSize = 20, status, plan, q } = params;
  const svc = getService();
  if (!svc) return { rows: mockTenants(), total: mockTenants().length };

  let query = svc.from("tenants").select("*, billing_subscriptions(location_limit, status, plan)", { count: "exact" });
  if (status) query = query.eq("status", status);
  if (plan) query = query.eq("plan_name", plan);
  if (q) {
    query = query.ilike("business_name", `%${q}%`);
  }
  query = query.order("created_at", { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1);

  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: data ?? [], total: count ?? 0 };
}

export async function fetchTenantDetail(id: string) {
  const svc = getService();
  if (!svc) return mockTenants().find((t) => t.tenant_id === id) ?? null;
  const { data, error } = await svc.from("tenants").select().eq("tenant_id", id).maybeSingle();
  if (error) throw error;
  const locations = await svc.from("locations").select().eq("tenant_id", id);
  const connections = await svc.from("gbp_connections").select().eq("tenant_id", id);
  const posts = await svc.from("post_history").select().eq("tenant_id", id).order("published_at", { ascending: false }).limit(5);
  const reviews = await svc.from("review_requests").select().eq("tenant_id", id).order("created_at", { ascending: false }).limit(5);
  const audits = await svc.from("billing_events").select().eq("tenant_id", id).order("created_at", { ascending: false }).limit(10);
  return {
    tenant: data,
    locations: locations.data ?? [],
    connections: connections.data ?? [],
    posts: posts.data ?? [],
    reviews: reviews.data ?? [],
    audits: audits.data ?? [],
  };
}

export async function fetchBilling() {
  const svc = getService();
  if (!svc) return { rows: mockBilling() };
  const { data, error } = await svc.from("billing_subscriptions").select().order("current_period_end", { ascending: false });
  if (error) throw error;
  return { rows: data ?? [] };
}

export async function fetchGbp() {
  const svc = getService();
  if (!svc) return { rows: mockGbp() };
  const { data, error } = await svc.from("gbp_connections").select("*, tenants!inner(business_name)").order("connected_at", { ascending: false });
  if (error) throw error;
  return { rows: data ?? [] };
}

export async function fetchUsage() {
  const svc = getService();
  if (!svc) return { aggregates: mockUsageAggregates(), rankings: mockUsageRankings() };
  const posts = await svc.from("post_history").select("tenant_id");
  const reviews = await svc.from("review_requests").select("tenant_id");
  const assets = await svc.from("content_assets").select("tenant_id");
  const aggregates = {
    posts: posts.data?.length ?? 0,
    reviews: reviews.data?.length ?? 0,
    uploads: assets.data?.length ?? 0,
  };
  const rankingMap = new Map<string, { tenant_id: string; posts: number; reviews: number }>();
  posts.data?.forEach((p) => {
    const entry = rankingMap.get(p.tenant_id) ?? { tenant_id: p.tenant_id, posts: 0, reviews: 0 };
    entry.posts += 1;
    rankingMap.set(p.tenant_id, entry);
  });
  reviews.data?.forEach((r) => {
    const entry = rankingMap.get(r.tenant_id) ?? { tenant_id: r.tenant_id, posts: 0, reviews: 0 };
    entry.reviews += 1;
    rankingMap.set(r.tenant_id, entry);
  });
  const rankings = Array.from(rankingMap.values()).sort((a, b) => b.posts + b.reviews - (a.posts + a.reviews)).slice(0, 20);
  return { aggregates, rankings };
}

export async function fetchAudit(params: { page?: number; pageSize?: number }) {
  const svc = getService();
  if (!svc) return { rows: mockAudit(), total: mockAudit().length };
  const { page = 1, pageSize = 30 } = params;
  const { data, error, count } = await svc
    .from("billing_events")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (error) throw error;
  return { rows: data ?? [], total: count ?? 0 };
}

export async function fetchSupport(params: { status?: string }) {
  const svc = getService();
  if (!svc) return { rows: mockSupport() };
  let query = svc.from("support_tickets").select().order("created_at", { ascending: false });
  if (params.status) query = query.eq("status", params.status);
  const { data, error } = await query;
  if (error) throw error;
  return { rows: data ?? [] };
}

// Mocks for dev / missing service key
const mockTenants = () => [
  {
    tenant_id: "t-acme",
    business_name: "Acme HVAC",
    status: "active",
    plan_name: "pro",
    location_limit: 5,
    created_at: new Date().toISOString(),
    last_activity: new Date().toISOString(),
  },
  {
    tenant_id: "t-plumb",
    business_name: "Northside Plumbing",
    status: "past_due",
    plan_name: "starter",
    location_limit: 2,
    created_at: new Date().toISOString(),
    last_activity: new Date().toISOString(),
  },
];

const mockKpis = () => ({
  activeTenants: 12,
  churned30d: 1,
  posts30d: 184,
  reviews30d: 96,
  failedJobs: 3,
  mrr: 6400,
  trend: 5,
});

const mockBilling = () => [
  {
    tenant_id: "t-acme",
    stripe_customer_id: "cus_123",
    stripe_subscription_id: "sub_123",
    status: "active",
    plan: "pro",
    location_limit: 5,
    current_period_end: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

const mockGbp = () => [
  {
    tenant_id: "t-acme",
    google_account_email: "owner@acme.com",
    connected_at: new Date().toISOString(),
    status: "connected",
    locations_connected: 3,
  },
];

const mockUsageAggregates = () => ({ posts: 120, reviews: 80, uploads: 42 });
const mockUsageRankings = () => [
  { tenant_id: "t-acme", posts: 40, reviews: 20 },
  { tenant_id: "t-plumb", posts: 25, reviews: 18 },
];

const mockAudit = () => [
  { id: "a1", tenant_id: "t-acme", event_type: "plan_change", old_value: "starter", new_value: "pro", created_at: new Date().toISOString(), actor_user_id: "admin" },
];

const mockSupport = () => [
  { id: "s1", tenant_id: "t-acme", subject: "Billing question", status: "open", created_at: new Date().toISOString() },
];

const mockPending = () => [
  {
    email: "owner@acme.com",
    business_name: "Acme HVAC",
    first_name: "Ada",
    last_name: "Lovelace",
    plan: "pro",
    location_limit: 3,
    status: "invited",
    invited_at: new Date().toISOString(),
    invited_by_admin_user_id: "admin-123",
  },
];

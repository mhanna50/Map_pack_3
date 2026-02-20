import { cookies } from "next/headers";
import { createClient as createServiceClient, SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export type AdminUser = { id: string; email?: string | null; role?: string | null; tenant_id?: string | null };

export async function requireAdminUser(): Promise<AdminUser> {
  const cookieStore = await cookies();
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

  // Prefer the service client so we can verify is_staff and heal the profile role.
  const svc = getService();
  if (svc) {
    const { data: staffUser, error: staffErr } = await svc
      .from("users")
      .select("id, email, is_staff")
      .eq("id", user.id)
      .maybeSingle();
    if (staffErr) throw staffErr;
    if (!staffUser?.is_staff) {
      throw new Error("Admin role required");
    }

    const { data: profile, error: profileErr } = await svc
      .from("profiles")
      .select("role, tenant_id, email")
      .eq("user_id", user.id)
      .maybeSingle();
    if (profileErr) throw profileErr;

    if (!profile) {
      const { error: upsertErr } = await svc
        .from("profiles")
        .upsert({ user_id: user.id, role: "admin", email: user.email?.toLowerCase() ?? null });
      if (upsertErr) throw upsertErr;
      return { id: user.id, email: user.email, role: "admin", tenant_id: null };
    }

    if (profile.role !== "admin" || !profile.email) {
      const { error: updateErr } = await svc
        .from("profiles")
        .update({ role: "admin", email: user.email?.toLowerCase() ?? profile.email })
        .eq("user_id", user.id);
      if (updateErr) throw updateErr;
    }

    return { id: user.id, email: user.email, role: "admin", tenant_id: profile.tenant_id };
  }

  // Fallback when service key is not configured.
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

function requireService(): SupabaseClient {
  const svc = getService();
  if (!svc) {
    throw new Error("Supabase service key not configured");
  }
  return svc;
}

// --- Onboarding helpers ---

export async function upsertPendingOnboarding(payload: {
  email: string;
  business_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  plan?: string | null;
  location_limit?: number | null;
  invited_by?: string | null;
  status?: string | null;
}) {
  const svc = requireService();

  const email = payload.email.toLowerCase();
  const { data: existing } = await svc.from("pending_onboarding").select("*").eq("email", email).maybeSingle();

  const merged = {
    email,
    business_name: payload.business_name ?? existing?.business_name ?? "",
    first_name: payload.first_name ?? existing?.first_name ?? "",
    last_name: payload.last_name ?? existing?.last_name ?? "",
    plan: payload.plan ?? existing?.plan ?? "starter",
    location_limit: payload.location_limit ?? existing?.location_limit ?? 1,
    status: payload.status ?? existing?.status ?? "invited",
    invited_at: existing?.invited_at ?? new Date().toISOString(),
    invited_by_admin_user_id: payload.invited_by ?? existing?.invited_by_admin_user_id ?? null,
  };

  const { data, error } = await svc
    .from("pending_onboarding")
    .upsert(merged, { onConflict: "email" })
    .select()
    .maybeSingle();
  if (error) throw error;
  return { pending: data, emailed: true };
}

export async function listPendingOnboarding() {
  const svc = requireService();
  const { data, error } = await svc
    .from("pending_onboarding")
    .select("*")
    .order("invited_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function cancelPendingOnboarding(email: string) {
  const svc = requireService();
  const { error } = await svc.from("pending_onboarding").update({ status: "canceled" }).eq("email", email.toLowerCase());
  if (error) throw error;
  return { canceled: true };
}

export async function sendSupabaseInvite(email: string, redirectTo: string) {
  const svc = requireService();
  const { data, error } = await svc.auth.admin.inviteUserByEmail(email, { redirectTo });
  if (error) throw error;
  return { emailed: true, inviteLink: data?.action_link ?? null };
}

export async function fetchKpis() {
  const svc = requireService();

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
  const svc = requireService();

  let query = svc.from("tenants").select("*", { count: "exact" });
  if (status) query = query.eq("status", status);
  if (q) {
    query = query.ilike("business_name", `%${q}%`);
  }
  query = query.order("created_at", { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1);

  const { data, error, count } = await query;
  if (error) {
    // Gracefully return empty so UI can show “no data” instead of failing.
    console.error("fetchTenants failed", error);
    return { rows: [], total: 0 };
  }
  return { rows: data ?? [], total: count ?? 0 };
}

export async function fetchTenantDetail(id: string) {
  const svc = requireService();
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
  const svc = requireService();
  const { data, error } = await svc.from("billing_subscriptions").select().order("current_period_end", { ascending: false });
  if (error) throw error;
  return { rows: data ?? [] };
}

export async function fetchGbp() {
  const svc = requireService();
  const { data, error } = await svc.from("gbp_connections").select("*, tenants!inner(business_name)").order("connected_at", { ascending: false });
  if (error) throw error;
  return { rows: data ?? [] };
}

export async function fetchUsage() {
  const svc = requireService();
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
  const svc = requireService();
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
  const svc = requireService();
  let query = svc.from("support_tickets").select().order("created_at", { ascending: false });
  if (params.status) query = query.eq("status", params.status);
  const { data, error } = await query;
  if (error) throw error;
  return { rows: data ?? [] };
}

import { cookies } from "next/headers";
import { createClient as createServiceClient, SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const shouldLogAuthRouting =
  process.env.LOG_AUTH_ROUTING === "true" || process.env.NODE_ENV !== "production";
const shouldLogOnboardingOps =
  process.env.LOG_ONBOARDING_OPS === "true" || process.env.NODE_ENV !== "production";

const logAuthRouting = (event: string, payload: Record<string, unknown>) => {
  if (!shouldLogAuthRouting) return;
  console.info(`[auth-routing] ${event}`, payload);
};

const logOnboardingOps = (event: string, payload: Record<string, unknown>) => {
  if (!shouldLogOnboardingOps) return;
  console.info(`[onboarding-admin] ${event}`, payload);
};

export type AdminUser = { id: string; email?: string | null; role?: string | null; tenant_id?: string | null };
type PostgrestErrorLike = {
  message?: string;
  details?: string | null;
  hint?: string | null;
  code?: string | null;
  status?: number | string | null;
};

function normalizeStatusCode(status: number | string | null | undefined): number | undefined {
  if (typeof status === "number") return status;
  if (typeof status !== "string") return undefined;
  const parsed = Number.parseInt(status, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isErrorLike(value: unknown): value is PostgrestErrorLike {
  return typeof value === "object" && value !== null;
}

function formatUnknownError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  if (isErrorLike(error)) {
    const parts: string[] = [];
    if (typeof error.message === "string" && error.message.trim()) parts.push(error.message.trim());
    if (typeof error.details === "string" && error.details.trim()) parts.push(`details: ${error.details.trim()}`);
    if (typeof error.hint === "string" && error.hint.trim()) parts.push(`hint: ${error.hint.trim()}`);
    if (typeof error.code === "string" && error.code.trim()) parts.push(`code: ${error.code.trim()}`);
    const status = normalizeStatusCode(error.status);
    if (status !== undefined) parts.push(`status: ${status}`);
    if (parts.length > 0) return parts.join(" | ");
  }

  return fallback;
}

function serializeUnknownError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  if (isErrorLike(error)) {
    return {
      message: error.message ?? null,
      details: error.details ?? null,
      hint: error.hint ?? null,
      code: error.code ?? null,
      status: normalizeStatusCode(error.status) ?? null,
    };
  }

  return { value: String(error) };
}

function toOperationalError(error: unknown, fallback: string): Error {
  if (error instanceof Error && error.message.trim()) {
    return error;
  }
  return new Error(formatUnknownError(error, fallback));
}

function isRpcLookupError(error: unknown, functionName: string): boolean {
  if (!isErrorLike(error)) return false;
  const code = typeof error.code === "string" ? error.code.toUpperCase() : "";
  if (code === "PGRST202" || code === "42883") {
    return true;
  }

  const message = `${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`.toLowerCase();
  return (
    message.includes("schema cache") ||
    message.includes("could not find the function") ||
    message.includes(`public.${functionName}`.toLowerCase())
  );
}

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

  const { data: routeData, error: routeErr } = await supabase.rpc("resolve_post_login_destination");
  if (!routeErr) {
    const row = Array.isArray(routeData) ? routeData[0] : routeData;
    const route = row && typeof row === "object" ? (row as { role?: unknown; tenant_id?: unknown }) : null;
    const normalizedRole = typeof route?.role === "string" ? route.role.trim().toLowerCase() : "";
    if (normalizedRole === "owner_admin") {
      logAuthRouting("admin_guard.rpc_resolution", {
        userId: user.id,
        email: user.email,
        role: "owner_admin",
        source: "resolve_post_login_destination",
      });
      return {
        id: user.id,
        email: user.email,
        role: "owner_admin",
        tenant_id: typeof route?.tenant_id === "string" ? route.tenant_id : null,
      };
    }
    logAuthRouting("admin_guard.rpc_denied", {
      userId: user.id,
      email: user.email,
      role: normalizedRole || "invalid",
      source: "resolve_post_login_destination",
    });
    throw new Error("Admin role required");
  }

  // Prefer the service client so we can verify is_staff and validate the profile role.
  const svc = getService();
  if (svc) {
    const { data: staffUser, error: staffErr } = await svc
      .from("users")
      .select("id, email, is_staff")
      .eq("id", user.id)
      .maybeSingle();
    if (staffErr) throw staffErr;

    const { data: profile, error: profileErr } = await svc
      .from("profiles")
      .select("role, tenant_id, email")
      .eq("user_id", user.id)
      .maybeSingle();
    if (profileErr) throw profileErr;

    const isAdminRole = profile?.role === "admin" || profile?.role === "super_admin";
    const isStaff = staffUser?.is_staff === true;

    if (!(isAdminRole || isStaff)) {
      logAuthRouting("admin_guard.legacy_denied", {
        userId: user.id,
        email: user.email,
        profileRole: profile?.role ?? null,
        isStaff: staffUser?.is_staff ?? null,
      });
      console.warn(
        `Admin access denied: role=${profile?.role ?? "missing"} is_staff=${staffUser?.is_staff ?? "missing"} user=${user.id}`,
      );
      throw new Error("Admin role required");
    }

    const email = profile?.email ?? staffUser?.email ?? user.email;
    if (!email) {
      console.warn(`Admin profile missing email for user ${user.id}`);
      throw new Error("Admin role required");
    }

    const resolvedRole = isAdminRole ? "admin" : "staff";
    logAuthRouting("admin_guard.legacy_resolution", {
      userId: user.id,
      email,
      role: resolvedRole,
      tenantId: profile?.tenant_id ?? null,
      source: "legacy_profiles_or_users",
    });
    return { id: user.id, email, role: resolvedRole, tenant_id: profile?.tenant_id };
  }

  // Fallback when service key is not configured.
  const { data: profile } = await supabase.from("profiles").select().eq("user_id", user.id).maybeSingle();
  if (profile?.role !== "admin") {
    logAuthRouting("admin_guard.fallback_denied", {
      userId: user.id,
      email: user.email,
      profileRole: profile?.role ?? null,
      source: "fallback_no_service_role",
    });
    throw new Error("Admin role required");
  }
  logAuthRouting("admin_guard.fallback_resolution", {
    userId: user.id,
    email: user.email,
    role: profile.role,
    tenantId: profile.tenant_id ?? null,
    source: "fallback_no_service_role",
  });
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

function isSchemaCompatibilityError(error: unknown): boolean {
  const err = error as PostgrestErrorLike | null;
  const code = err?.code ?? "";
  const message = `${err?.message ?? ""} ${err?.details ?? ""}`.toLowerCase();
  return (
    code === "42P01" || // undefined_table
    code === "42703" || // undefined_column
    code === "PGRST204" || // column/table missing from schema cache
    message.includes("does not exist") ||
    message.includes("schema cache")
  );
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
  expires_at?: string | null;
}) {
  const svc = requireService();

  const email = payload.email.trim().toLowerCase();
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
    expires_at: payload.expires_at ?? existing?.expires_at ?? null,
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
    .not("invited_by_admin_user_id", "is", "null")
    .order("invited_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

type CancelInviteAndPurgeRpcRow = {
  canceled?: boolean | null;
  resend_ready?: boolean | null;
  message?: string | null;
  deleted_auth_users?: number | null;
  deleted_public_rows?: number | null;
};

type ResendReadyRpcRow = {
  ready?: boolean | null;
  reason?: string | null;
};

export async function cancelOnboardingInviteAndPurge(email: string) {
  const svc = requireService();
  const normalized = email.trim().toLowerCase();
  if (!normalized) {
    throw new Error("email is required");
  }

  const operationId = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  logOnboardingOps("cancel_invite.start", {
    operationId,
    email: normalized,
  });

  let { data, error } = await svc.rpc("cancel_onboarding_invite_and_purge", {
    p_email: normalized,
  });
  if (error && isRpcLookupError(error, "cancel_onboarding_invite_and_purge")) {
    logOnboardingOps("cancel_invite.rpc_lookup_retry", {
      operationId,
      email: normalized,
      error: serializeUnknownError(error),
      retryWith: "email",
    });
    const retry = await svc.rpc("cancel_onboarding_invite_and_purge", {
      email: normalized,
    });
    data = retry.data;
    error = retry.error;
  }

  if (error) {
    logOnboardingOps("cancel_invite.error", {
      operationId,
      email: normalized,
      error: serializeUnknownError(error),
    });
    throw toOperationalError(error, "failed to cancel invite");
  }

  const row = (Array.isArray(data) ? data[0] : data) as CancelInviteAndPurgeRpcRow | null;
  if (!row) {
    logOnboardingOps("cancel_invite.empty_result", {
      operationId,
      email: normalized,
    });
    throw new Error("Cancel invite cleanup did not return a result");
  }

  const result = {
    canceled: row.canceled === true,
    resendReady: row.resend_ready === true,
    message: row.message ?? null,
    deletedAuthUsers: Number(row.deleted_auth_users ?? 0),
    deletedPublicRows: Number(row.deleted_public_rows ?? 0),
  };

  logOnboardingOps("cancel_invite.success", {
    operationId,
    email: normalized,
    canceled: result.canceled,
    resendReady: result.resendReady,
    deletedAuthUsers: result.deletedAuthUsers,
    deletedPublicRows: result.deletedPublicRows,
    message: result.message,
  });

  return result;
}

export async function isOnboardingInviteResendReady(email: string) {
  const svc = requireService();
  const normalized = email.trim().toLowerCase();
  if (!normalized) {
    throw new Error("email is required");
  }

  let { data, error } = await svc.rpc("is_onboarding_invite_resend_ready", {
    p_email: normalized,
  });
  if (error && isRpcLookupError(error, "is_onboarding_invite_resend_ready")) {
    const retry = await svc.rpc("is_onboarding_invite_resend_ready", {
      email: normalized,
    });
    data = retry.data;
    error = retry.error;
  }
  if (error) throw toOperationalError(error, "failed to verify resend readiness");

  const row = (Array.isArray(data) ? data[0] : data) as ResendReadyRpcRow | null;
  if (!row) {
    throw new Error("Resend readiness check did not return a result");
  }

  return {
    ready: row.ready === true,
    reason: row.reason ?? null,
  };
}

async function sendMagicLink(email: string, redirectTo: string) {
  const svc = requireService();
  // Generate a fresh magic link for manual copy while also sending an OTP email via Supabase.
  const { data: magic, error: magicErr } = await svc.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo },
  });
  if (magicErr) throw magicErr;

  const { error: otpErr } = await svc.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo, shouldCreateUser: true },
  });
  if (otpErr) throw otpErr;

  return { emailed: true, inviteLink: magic?.properties?.action_link ?? null, method: "magiclink" as const };
}

export async function sendSupabaseInvite(email: string, redirectTo: string) {
  const svc = requireService();
  const lower = email.trim().toLowerCase();
  const { data, error } = await svc.auth.admin.inviteUserByEmail(lower, { redirectTo });

  if (!error) {
    const inviteLink = ((data as { action_link?: string | null } | null)?.action_link ?? null);
    return { emailed: true, inviteLink, method: "invite" as const };
  }

  const message = (error as Error).message?.toLowerCase() ?? "";
  const alreadyRegistered = message.includes("already") && message.includes("registr");
  const rateLimited = (error as { status?: number }).status === 429;

  if (alreadyRegistered || rateLimited) {
    // Supabase will not resend invite emails once a user exists; fall back to a magic link email.
    return sendMagicLink(lower, redirectTo);
  }

  throw error;
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

const BILLING_TENANT_STATUSES = ["active", "canceled"] as const;

function normalizeBillingStatus(status?: string | null): string | null {
  const normalized = String(status ?? "").trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "cancelled") return "canceled";
  return BILLING_TENANT_STATUSES.includes(normalized as (typeof BILLING_TENANT_STATUSES)[number]) ? normalized : null;
}

type BillingSubscriptionRow = {
  tenant_id?: string | null;
  status?: string | null;
  plan?: string | null;
  location_limit?: number | null;
  created_at?: string | null;
};

export async function fetchTenants(params: { page?: number; pageSize?: number; status?: string; q?: string }) {
  const { page = 1, pageSize = 20, status, q } = params;
  const svc = requireService();
  const requestedStatus = normalizeBillingStatus(status);
  const statusFilterValues = requestedStatus
    ? [requestedStatus]
    : [...BILLING_TENANT_STATUSES];

  const billing = await svc
    .from("billing_subscriptions")
    .select("tenant_id, status, plan, location_limit, created_at")
    .in("status", statusFilterValues)
    .order("created_at", { ascending: false });
  if (billing.error) {
    console.error("fetchTenants billing lookup failed", billing.error);
    return { rows: [], total: 0 };
  }

  const latestByTenant = new Map<string, BillingSubscriptionRow>();
  (billing.data ?? []).forEach((entry) => {
    const tenantId = typeof entry.tenant_id === "string" ? entry.tenant_id : "";
    if (!tenantId || latestByTenant.has(tenantId)) return;
    const normalized = normalizeBillingStatus(entry.status);
    if (!normalized) return;
    latestByTenant.set(tenantId, { ...entry, status: normalized });
  });

  const subscribedTenantIds = Array.from(latestByTenant.keys());
  if (subscribedTenantIds.length === 0) {
    return { rows: [], total: 0 };
  }

  let query = svc.from("tenants").select("*").in("tenant_id", subscribedTenantIds);
  if (q) {
    query = query.ilike("business_name", `%${q}%`);
  }
  const { data, error } = await query;
  if (error) {
    // Gracefully return empty so UI can show “no data” instead of failing.
    console.error("fetchTenants failed", error);
    return { rows: [], total: 0 };
  }

  const merged = (data ?? [])
    .map((tenant) => {
      const subscription = latestByTenant.get(String(tenant.tenant_id));
      if (!subscription) return null;
      return {
        ...tenant,
        status: normalizeBillingStatus(subscription.status) ?? "canceled",
      };
    })
    .filter((tenant): tenant is Record<string, unknown> => Boolean(tenant))
    .sort(
      (a, b) =>
        (b.created_at ? new Date(String(b.created_at)).getTime() : 0) - (a.created_at ? new Date(String(a.created_at)).getTime() : 0),
    );

  const total = merged.length;
  const start = Math.max(0, (page - 1) * pageSize);
  const rows = merged.slice(start, start + pageSize);
  return { rows, total };
}

export async function fetchTenantDetail(id: string) {
  const svc = requireService();
  const { data, error } = await svc.from("tenants").select().eq("tenant_id", id).maybeSingle();
  if (error) throw error;
  let orgPostingPaused: boolean | null = null;
  const orgStatus = await svc.from("organizations").select("id, posting_paused").eq("id", id).maybeSingle();
  if (orgStatus.error) {
    if (!isSchemaCompatibilityError(orgStatus.error)) {
      throw orgStatus.error;
    }
  } else {
    orgPostingPaused = orgStatus.data?.posting_paused ?? null;
  }
  const locations = await svc.from("locations").select().eq("tenant_id", id);
  const connections = await svc.from("gbp_connections").select().eq("tenant_id", id);
  const posts = await svc.from("post_history").select().eq("tenant_id", id).order("published_at", { ascending: false }).limit(5);
  const reviews = await svc.from("review_requests").select().eq("tenant_id", id).order("created_at", { ascending: false }).limit(5);
  const audits = await svc.from("billing_events").select().eq("tenant_id", id).order("created_at", { ascending: false }).limit(10);
  const tenant = data ? { ...data, posting_paused: orgPostingPaused ?? data.posting_paused ?? false } : data;
  return {
    tenant,
    locations: locations.data ?? [],
    connections: connections.data ?? [],
    posts: posts.data ?? [],
    reviews: reviews.data ?? [],
    audits: audits.data ?? [],
  };
}

export async function setTenantAutomationPaused(id: string, paused: boolean) {
  const svc = requireService();

  const orgResult = await svc
    .from("organizations")
    .update({ posting_paused: paused })
    .eq("id", id)
    .select("id, posting_paused")
    .maybeSingle();
  if (orgResult.error && !isSchemaCompatibilityError(orgResult.error)) {
    throw orgResult.error;
  }

  const tenantResult = await svc
    .from("tenants")
    .update({ posting_paused: paused })
    .eq("tenant_id", id)
    .select("tenant_id, posting_paused")
    .maybeSingle();
  if (tenantResult.error && !isSchemaCompatibilityError(tenantResult.error)) {
    throw tenantResult.error;
  }

  const orgUpdated = Boolean(orgResult.data);
  const tenantUpdated = Boolean(tenantResult.data);

  if (!orgUpdated && !tenantUpdated) {
    throw new Error("Tenant not found");
  }

  return {
    tenant_id: id,
    paused: orgResult.data?.posting_paused ?? tenantResult.data?.posting_paused ?? paused,
    organization_updated: orgUpdated,
    tenant_updated: tenantUpdated,
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

export type AdminMonitoringFilters = {
  tenantIds?: string[];
  range?: "today" | "7d" | "30d" | "90d" | "custom";
  from?: string;
  to?: string;
  module?: string;
  status?: string;
  q?: string;
};

const ADMIN_MODULES = [
  { id: "lead_recovery", label: "Lead Recovery", clientPath: "/dashboard/lead-recovery" },
  { id: "gbp_posting", label: "GBP Posting", clientPath: "/dashboard/content" },
  { id: "gbp_audits", label: "GBP Audits", clientPath: "/dashboard/gbp-audit" },
  { id: "reviews", label: "Reviews", clientPath: "/dashboard/reviews" },
  { id: "citations", label: "Citations", clientPath: "/dashboard/gbp" },
  { id: "visibility", label: "Visibility", clientPath: "/dashboard/keywords" },
  { id: "images", label: "Images", clientPath: "/dashboard/content" },
  { id: "qa", label: "Q&A", clientPath: "/dashboard/gbp" },
  { id: "website_audits", label: "Website Audits", clientPath: "/dashboard/gbp-audit" },
] as const;

type TenantRow = Record<string, unknown> & {
  tenant_id?: string;
  business_name?: string;
  status?: string;
  created_at?: string;
  client_stage?: string;
  subscription_status?: string;
};
type CountResult = { count: number; error?: unknown };

function dateRange(filters: AdminMonitoringFilters = {}) {
  const now = new Date();
  let from = filters.from;
  const to = filters.to ?? now.toISOString();
  if (!from) {
    const start = new Date(now);
    if (filters.range === "today") start.setHours(0, 0, 0, 0);
    else if (filters.range === "90d") start.setDate(start.getDate() - 90);
    else if (filters.range === "7d") start.setDate(start.getDate() - 7);
    else start.setDate(start.getDate() - 30);
    from = start.toISOString();
  }
  return { from, to };
}

function tenantIdsFromParam(raw?: string | string[] | null): string[] | undefined {
  if (!raw) return undefined;
  const values = Array.isArray(raw) ? raw : String(raw).split(",");
  const ids = values.map((value) => value.trim()).filter(Boolean);
  return ids.length ? ids : undefined;
}

export function parseAdminMonitoringFilters(searchParams: URLSearchParams): AdminMonitoringFilters {
  return {
    tenantIds: tenantIdsFromParam(searchParams.get("tenant_ids") ?? searchParams.get("tenant_id")),
    range: (searchParams.get("range") as AdminMonitoringFilters["range"]) ?? "30d",
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
    module: searchParams.get("module") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    q: searchParams.get("q") ?? undefined,
  };
}

async function safeCount(table: string, filters: AdminMonitoringFilters = {}, dateColumn = "created_at"): Promise<CountResult> {
  try {
    const svc = requireService();
    const { from, to } = dateRange(filters);
    let query = svc.from(table).select("id", { count: "exact", head: true });
    if (dateColumn) query = query.gte(dateColumn, from).lte(dateColumn, to);
    if (filters.tenantIds?.length) query = query.in("tenant_id", filters.tenantIds);
    const { count, error } = await query;
    if (error && isSchemaCompatibilityError(error)) return { count: 0, error };
    if (error) throw error;
    return { count: count ?? 0 };
  } catch (error) {
    if (isSchemaCompatibilityError(error)) return { count: 0, error };
    throw error;
  }
}

async function loadTenantsForMonitoring(filters: AdminMonitoringFilters = {}): Promise<TenantRow[]> {
  const svc = requireService();
  let query = svc.from("tenants").select("*").order("business_name", { ascending: true });
  if (filters.tenantIds?.length) query = query.in("tenant_id", filters.tenantIds);
  if (filters.q) query = query.ilike("business_name", `%${filters.q}%`);
  const { data, error } = await query;
  if (error && isSchemaCompatibilityError(error)) return [];
  if (error) throw error;
  return (data ?? []) as TenantRow[];
}

async function loadBillingByTenant(tenantIds?: string[]) {
  const svc = requireService();
  let query = svc.from("billing_subscriptions").select("*").order("created_at", { ascending: false });
  if (tenantIds?.length) query = query.in("tenant_id", tenantIds);
  const { data, error } = await query;
  if (error && isSchemaCompatibilityError(error)) return new Map<string, Record<string, unknown>>();
  if (error) throw error;
  const byTenant = new Map<string, Record<string, unknown>>();
  (data ?? []).forEach((row: Record<string, unknown>) => {
    const tenantId = String(row.tenant_id ?? "");
    if (tenantId && !byTenant.has(tenantId)) byTenant.set(tenantId, row);
  });
  return byTenant;
}

async function loadProspectiveClientsForMonitoring(filters: AdminMonitoringFilters = {}): Promise<TenantRow[]> {
  if (filters.tenantIds?.length) return [];
  try {
    const svc = requireService();
    let query = svc
      .from("pending_onboarding")
      .select("*")
      .order("invited_at", { ascending: false })
      .limit(500);
    if (filters.q) {
      query = query.or(`business_name.ilike.%${filters.q}%,email.ilike.%${filters.q}%`);
    }
    const { data, error } = await query;
    if (error && isSchemaCompatibilityError(error)) return [];
    if (error) throw error;
    return (data ?? [])
      .filter((row: Record<string, unknown>) => {
        const status = String(row.status ?? "").toLowerCase();
        return !["completed", "activated", "google_connected", "canceled"].includes(status);
      })
      .map((row: Record<string, unknown>) => {
        const email = String(row.email ?? "");
        return {
          tenant_id: `prospective:${email || row.id || row.invited_at}`,
          business_name: String(row.business_name ?? email ?? "Prospective client"),
          status: "prospective",
          subscription_status: "prospective",
          client_stage: "prospective",
          email,
          plan: row.plan ?? null,
          created_at: String(row.invited_at ?? row.created_at ?? ""),
          last_activity: String(row.invited_at ?? row.created_at ?? ""),
          open_issues: ["Invite not completed"],
          active_modules: [],
          is_prospective: true,
        } as TenantRow;
      });
  } catch (error) {
    if (isSchemaCompatibilityError(error)) return [];
    throw error;
  }
}

async function loadRows(table: string, filters: AdminMonitoringFilters = {}, options: { limit?: number; dateColumn?: string } = {}) {
  try {
    const svc = requireService();
    const { from, to } = dateRange(filters);
    let query = svc.from(table).select("*").order(options.dateColumn ?? "created_at", { ascending: false }).limit(options.limit ?? 500);
    if (filters.tenantIds?.length) query = query.in("tenant_id", filters.tenantIds);
    if (options.dateColumn !== "") query = query.gte(options.dateColumn ?? "created_at", from).lte(options.dateColumn ?? "created_at", to);
    const { data, error } = await query;
    if (error && isSchemaCompatibilityError(error)) return [];
    if (error) throw error;
    return (data ?? []) as Record<string, unknown>[];
  } catch (error) {
    if (isSchemaCompatibilityError(error)) return [];
    throw error;
  }
}

async function buildModuleHealth(tenants: TenantRow[], filters: AdminMonitoringFilters = {}) {
  const tenantIds = tenants.map((tenant) => String(tenant.tenant_id)).filter(Boolean);
  const scopedFilters = { ...filters, tenantIds: filters.tenantIds ?? tenantIds };
  const [leadSettings, gbpConnections, locations, leadEvents, posts, audits, reviews, reviewRequests, mediaRequests, qnaRows, ranks] =
    await Promise.all([
      loadRows("lead_recovery_settings", { ...scopedFilters }, { dateColumn: "", limit: 10000 }),
      loadRows("gbp_connections", scopedFilters, { dateColumn: "", limit: 10000 }),
      loadRows("locations", scopedFilters, { dateColumn: "", limit: 10000 }),
      loadRows("lead_events", scopedFilters, { limit: 10000 }),
      safeCount("post_history", scopedFilters, "published_at"),
      safeCount("listing_audits", scopedFilters, "audited_at"),
      safeCount("reviews", scopedFilters, "created_at"),
      safeCount("review_requests", scopedFilters, "created_at"),
      safeCount("media_upload_requests", scopedFilters, "created_at"),
      safeCount("qna_entries", scopedFilters, "created_at"),
      safeCount("rank_snapshots", scopedFilters, "created_at"),
    ]);
  const leadActive = new Set(leadSettings.filter(leadRecoveryIsActive).map((row) => String(row.tenant_id)));
  const gbpActive = new Set(gbpConnections.filter((row) => ["connected", "active"].includes(String(row.status ?? "").toLowerCase())).map((row) => String(row.tenant_id)));
  const hasLocations = new Set(locations.map((row) => String(row.tenant_id)));
  const tenantCount = tenantIds.length || tenants.length || 0;

  return [
    moduleHealth("lead_recovery", "Lead Recovery", leadActive.size, tenantCount, leadEvents.length, leadSettings.filter((row) => row.enabled === true && !leadRecoveryIsActive(row)).length),
    moduleHealth("gbp_posting", "GBP Posting", gbpActive.size || hasLocations.size, tenantCount, posts.count, 0),
    moduleHealth("gbp_audits", "GBP Audits", hasLocations.size, tenantCount, audits.count, 0),
    moduleHealth("reviews", "Reviews", gbpActive.size || hasLocations.size, tenantCount, reviews.count + reviewRequests.count, 0),
    moduleHealth("citations", "Citations", 0, tenantCount, 0, 0),
    moduleHealth("visibility", "Visibility", hasLocations.size, tenantCount, ranks.count, 0),
    moduleHealth("images", "Images", hasLocations.size, tenantCount, mediaRequests.count, 0),
    moduleHealth("qa", "Q&A", hasLocations.size, tenantCount, qnaRows.count, 0),
    moduleHealth("website_audits", "Website Audits", 0, tenantCount, 0, 0),
  ];
}

function moduleHealth(id: string, label: string, active: number, total: number, activity: number, issues: number) {
  return {
    id,
    label,
    active_clients: active,
    inactive_clients: Math.max(0, total - active),
    activity_count: activity,
    issue_count: issues,
    status: issues > 0 ? "warning" : active > 0 ? "healthy" : "inactive",
    client_path: ADMIN_MODULES.find((module) => module.id === id)?.clientPath ?? "/dashboard",
  };
}

function leadRecoveryIsActive(row: Record<string, unknown>) {
  return row.enabled === true && ["active", "verified"].includes(String(row.forwarding_status ?? "").toLowerCase());
}

export async function getAdminOverviewStats(filters: AdminMonitoringFilters = {}) {
  const tenants = await loadTenantsForMonitoring(filters);
  const tenantIds = tenants.map((tenant) => String(tenant.tenant_id)).filter(Boolean);
  const scopedFilters = { ...filters, tenantIds: filters.tenantIds ?? tenantIds };
  const [billing, pending, leadSettings, leads, ownerNotifications, posts, reviewRequests, reviews, activity, jobs, alerts] =
    await Promise.all([
      loadBillingByTenant(scopedFilters.tenantIds),
      safeCount("pending_onboarding", filters, "created_at"),
      loadRows("lead_recovery_settings", scopedFilters, { dateColumn: "", limit: 10000 }),
      safeCount("leads", scopedFilters, "created_at"),
      safeCount("lead_events", { ...scopedFilters, status: undefined }, "created_at"),
      safeCount("post_history", scopedFilters, "published_at"),
      safeCount("review_requests", scopedFilters, "created_at"),
      safeCount("reviews", scopedFilters, "created_at"),
      loadRows("client_activity_events", scopedFilters, { limit: 100 }),
      loadRows("jobs", scopedFilters, { limit: 100 }),
      loadRows("alerts", scopedFilters, { limit: 100 }),
    ]);
  const moduleHealth = await buildModuleHealth(tenants, scopedFilters);
  const activeClients = tenants.filter((tenant) => String(tenant.status ?? "").toLowerCase() === "active").length;
  const inactiveBilling = Array.from(billing.values()).filter((row) => !["active", "trialing"].includes(String(row.status ?? "").toLowerCase())).length;
  const leadSetupIssues = leadSettings.filter((row) => row.enabled === true && (!row.twilio_phone_number || !leadRecoveryIsActive(row))).length;
  const failedJobs = jobs.filter((job) => ["failed", "dead_lettered"].includes(String(job.status ?? "").toLowerCase())).length;
  const openAlerts = alerts.filter((alert) => String(alert.status ?? "").toLowerCase() !== "resolved").length;
  const attention = buildAttentionList({ tenants, billing, leadSettings, failedJobs, openAlerts });

  return {
    filters: scopedFilters,
    stats: {
      total_clients: tenants.length,
      active_clients: activeClients,
      onboarding_clients: pending.count,
      incomplete_setup_clients: leadSetupIssues,
      failed_integrations_clients: inactiveBilling,
      inactive_automations_clients: moduleHealth.reduce((sum, module) => sum + module.inactive_clients, 0),
      attention_clients: attention.length,
      recent_posts: posts.count,
      recent_review_requests: reviewRequests.count,
      recent_reviews: reviews.count,
      recent_leads: leads.count,
      recent_owner_notifications: ownerNotifications.count,
      failed_jobs: failedJobs,
      open_alerts: openAlerts,
    },
    module_health: moduleHealth,
    recent_activity: normalizeActivityRows(activity, tenants).slice(0, 50),
    attention,
  };
}

function buildAttentionList(input: {
  tenants: TenantRow[];
  billing: Map<string, Record<string, unknown>>;
  leadSettings: Record<string, unknown>[];
  failedJobs: number;
  openAlerts: number;
}) {
  const tenantName = new Map(input.tenants.map((tenant) => [String(tenant.tenant_id), String(tenant.business_name ?? "Client")]));
  const issues: Record<string, unknown>[] = [];
  input.billing.forEach((billing, tenantId) => {
    const status = String(billing.status ?? "").toLowerCase();
    if (status && !["active", "trialing"].includes(status)) {
      issues.push({ severity: "critical", tenant_id: tenantId, client: tenantName.get(tenantId), title: "Subscription inactive or payment issue", module: "billing" });
    }
  });
  input.leadSettings.forEach((setting) => {
    const tenantId = String(setting.tenant_id ?? "");
    if (setting.enabled === true && !setting.twilio_phone_number) {
      issues.push({ severity: "critical", tenant_id: tenantId, client: tenantName.get(tenantId), title: "Lead Recovery Twilio number missing", module: "lead_recovery" });
    } else if (setting.enabled === true && !leadRecoveryIsActive(setting)) {
      issues.push({ severity: "warning", tenant_id: tenantId, client: tenantName.get(tenantId), title: "Lead Recovery forwarding not configured", module: "lead_recovery" });
    }
    if (setting.enabled === true && !setting.owner_notification_phone && !setting.owner_notification_email) {
      issues.push({ severity: "warning", tenant_id: tenantId, client: tenantName.get(tenantId), title: "Owner notification destination missing", module: "lead_recovery" });
    }
  });
  if (input.failedJobs > 0) issues.push({ severity: "critical", title: `${input.failedJobs} failed background jobs`, module: "automation" });
  if (input.openAlerts > 0) issues.push({ severity: "warning", title: `${input.openAlerts} open alerts`, module: "alerts" });
  return issues.slice(0, 100);
}

function normalizeActivityRows(rows: Record<string, unknown>[], tenants: TenantRow[]) {
  const tenantName = new Map(tenants.map((tenant) => [String(tenant.tenant_id), String(tenant.business_name ?? "Client")]));
  return rows.map((row) => ({
    id: row.id,
    tenant_id: row.tenant_id,
    client: tenantName.get(String(row.tenant_id)) ?? "Client",
    module: row.module,
    event_type: row.event_type,
    status: row.status,
    title: row.title ?? row.event_type,
    description: row.description,
    created_at: row.created_at,
  }));
}

export async function getAdminClientsMonitor(filters: AdminMonitoringFilters = {}) {
  const tenants = await loadTenantsForMonitoring(filters);
  const tenantIds = tenants.map((tenant) => String(tenant.tenant_id)).filter(Boolean);
  const [billing, moduleHealth, leadSettings, activity] = await Promise.all([
    loadBillingByTenant(tenantIds),
    buildModuleHealth(tenants, { ...filters, tenantIds }),
    loadRows("lead_recovery_settings", { ...filters, tenantIds }, { dateColumn: "", limit: 10000 }),
    loadRows("client_activity_events", { ...filters, tenantIds }, { limit: 500 }),
  ]);
  const leadByTenant = new Map(leadSettings.map((row) => [String(row.tenant_id), row]));
  const activityByTenant = new Map<string, string>();
  activity.forEach((row) => {
    const tenantId = String(row.tenant_id ?? "");
    if (tenantId && !activityByTenant.has(tenantId)) activityByTenant.set(tenantId, String(row.created_at ?? ""));
  });
  const tenantRows = tenants.map((tenant) => {
    const tenantId = String(tenant.tenant_id);
    const activeModules = moduleHealth.filter((module) => module.active_clients > 0).map((module) => module.label);
    const billingRow = billing.get(tenantId);
    const leadSetting = leadByTenant.get(tenantId);
    const subscriptionStatus = String(billingRow?.status ?? tenant.status ?? "unknown").toLowerCase();
    const clientStage = ["active", "trialing", "past_due"].includes(subscriptionStatus) ? "active" : "past";
    const issues = [
      billingRow && !["active", "trialing"].includes(String(billingRow.status ?? "").toLowerCase()) ? "Billing issue" : null,
      leadSetting?.enabled === true && !leadRecoveryIsActive(leadSetting) ? "Lead forwarding setup" : null,
      leadSetting?.enabled === true && !leadSetting.owner_notification_phone && !leadSetting.owner_notification_email ? "Owner notification missing" : null,
    ].filter(Boolean);
    return {
      ...tenant,
      subscription_status: billingRow?.status ?? tenant.status ?? "unknown",
      client_stage: clientStage,
      plan: billingRow?.plan ?? tenant.plan ?? null,
      active_modules: activeModules,
      last_activity: activityByTenant.get(tenantId) ?? tenant.last_activity ?? tenant.updated_at ?? tenant.created_at,
      open_issues: issues,
      mrr: billingRow?.amount ?? billingRow?.price_amount ?? null,
    };
  });
  const prospects = await loadProspectiveClientsForMonitoring(filters);
  const rows = [...tenantRows, ...prospects].filter((row) => {
    const requested = String(filters.status ?? "").toLowerCase();
    if (!requested) return true;
    if (requested === "past") return row.client_stage === "past";
    if (requested === "prospective") return row.client_stage === "prospective";
    if (requested === "active") return row.client_stage === "active";
    return String(row.subscription_status ?? row.status ?? "").toLowerCase() === requested;
  });
  return { rows, total: rows.length, module_health: moduleHealth };
}

export async function getAdminModuleHealth(filters: AdminMonitoringFilters = {}) {
  const tenants = await loadTenantsForMonitoring(filters);
  return { rows: await buildModuleHealth(tenants, filters), modules: ADMIN_MODULES };
}

export async function getAdminClientStats(tenantId: string, filters: AdminMonitoringFilters = {}) {
  const [clientData, notes, activity, moduleHealth] = await Promise.all([
    fetchTenantDetail(tenantId),
    getAdminClientNotes(tenantId),
    loadRows("client_activity_events", { ...filters, tenantIds: [tenantId] }, { limit: 100 }),
    getAdminModuleHealth({ ...filters, tenantIds: [tenantId] }),
  ]);
  const overview = await getAdminOverviewStats({ ...filters, tenantIds: [tenantId] });
  return {
    ...clientData,
    stats: overview.stats,
    module_health: moduleHealth.rows,
    recent_activity: normalizeActivityRows(activity, clientData.tenant ? [clientData.tenant as TenantRow] : []),
    attention: overview.attention,
    notes: notes.rows,
  };
}

export async function getAdminLeadRecoveryStats(filters: AdminMonitoringFilters = {}) {
  const tenants = await loadTenantsForMonitoring(filters);
  const tenantIds = tenants.map((tenant) => String(tenant.tenant_id)).filter(Boolean);
  const scoped = { ...filters, tenantIds: filters.tenantIds ?? tenantIds };
  const [settingsRows, leads, messages, events] = await Promise.all([
    loadRows("lead_recovery_settings", scoped, { dateColumn: "", limit: 10000 }),
    loadRows("leads", scoped, { limit: 10000 }),
    loadRows("lead_messages", scoped, { limit: 10000 }),
    loadRows("lead_events", scoped, { limit: 10000 }),
  ]);
  const tenantName = new Map(tenants.map((tenant) => [String(tenant.tenant_id), String(tenant.business_name ?? "Client")]));
  const missedCalls = events.filter((event) => event.event_type === "missed_call_received").length;
  const textbacks = messages.filter((message) => message.direction === "outbound" && message.channel === "sms").length;
  const customerResponses = messages.filter((message) => message.direction === "inbound" && message.channel === "sms").length;
  const qualified = leads.filter((lead) => lead.status === "qualified").length;
  const booked = leads.filter((lead) => lead.status === "booked").length;
  const lost = leads.filter((lead) => lead.status === "lost").length;
  const completed = leads.filter((lead) => lead.status === "completed").length;
  const ownerNotifications = events.filter((event) => event.event_type === "owner_notified").length;
  const rows = leads.map((lead) => ({
    ...lead,
    client: tenantName.get(String(lead.tenant_id)) ?? "Client",
    owner_notified: events.some((event) => event.lead_id === lead.id && event.event_type === "owner_notified"),
    booked: lead.status === "booked" || lead.status === "completed",
  }));
  return {
    stats: {
      missed_calls: missedCalls,
      textbacks,
      customer_responses: customerResponses,
      qualified_leads: qualified,
      owner_notifications: ownerNotifications,
      booked_leads: booked,
      lost_leads: lost,
      completed_leads: completed,
      response_rate: missedCalls ? Math.round((customerResponses / missedCalls) * 100) : 0,
      booking_rate: qualified ? Math.round(((booked + completed) / qualified) * 100) : 0,
      average_response_minutes: null,
      needs_follow_up: leads.filter((lead) => ["new", "auto_contacted", "responded", "qualified"].includes(String(lead.status))).length,
      no_owner_action: leads.filter((lead) => !events.some((event) => event.lead_id === lead.id && event.event_type === "owner_notified")).length,
      delivery_failures: events.filter((event) => String(event.status ?? "").toLowerCase() === "failed").length,
      forwarding_not_configured: settingsRows.filter((setting) => setting.enabled === true && !leadRecoveryIsActive(setting)).length,
      waiting_for_verification: settingsRows.filter((setting) => setting.forwarding_status === "waiting_for_verification").length,
      verification_failed: settingsRows.filter((setting) => ["failed", "error"].includes(String(setting.forwarding_status))).length,
      skipped_clients: settingsRows.filter((setting) => setting.forwarding_status === "skipped").length,
      disabled_clients: settingsRows.filter((setting) => setting.enabled !== true).length,
    },
    rows,
  };
}

export async function getAdminLeadDetail(leadId: string) {
  const svc = requireService();
  const { data: lead, error } = await svc.from("leads").select("*").eq("id", leadId).maybeSingle();
  if (error) throw error;
  if (!lead) throw new Error("Lead not found");
  const [messages, events, notes] = await Promise.all([
    svc.from("lead_messages").select("*").eq("lead_id", leadId).order("created_at", { ascending: true }),
    svc.from("lead_events").select("*").eq("lead_id", leadId).order("created_at", { ascending: false }),
    svc.from("lead_notes").select("*").eq("lead_id", leadId).order("created_at", { ascending: false }),
  ]);
  if (messages.error && !isSchemaCompatibilityError(messages.error)) throw messages.error;
  if (events.error && !isSchemaCompatibilityError(events.error)) throw events.error;
  if (notes.error && !isSchemaCompatibilityError(notes.error)) throw notes.error;
  return { lead, messages: messages.data ?? [], events: events.data ?? [], notes: notes.data ?? [] };
}

export async function getAdminModuleStats(moduleId: string, filters: AdminMonitoringFilters = {}) {
  if (moduleId === "lead-recovery" || moduleId === "lead_recovery") return getAdminLeadRecoveryStats(filters);
  const tableByModule: Record<string, { table: string; dateColumn?: string; title: string }> = {
    "gbp-posting": { table: "post_history", dateColumn: "published_at", title: "GBP Posting" },
    gbp_posting: { table: "post_history", dateColumn: "published_at", title: "GBP Posting" },
    "gbp-audits": { table: "listing_audits", dateColumn: "audited_at", title: "GBP Audits" },
    gbp_audits: { table: "listing_audits", dateColumn: "audited_at", title: "GBP Audits" },
    reviews: { table: "reviews", title: "Reviews" },
    citations: { table: "client_activity_events", title: "Citations" },
    visibility: { table: "rank_snapshots", title: "Visibility" },
    images: { table: "media_upload_requests", title: "Images" },
    qa: { table: "qna_entries", title: "Q&A" },
    "website-audits": { table: "client_activity_events", title: "Website Audits" },
    website_audits: { table: "client_activity_events", title: "Website Audits" },
  };
  const config = tableByModule[moduleId] ?? { table: "client_activity_events", title: moduleId };
  const rows = await loadRows(config.table, filters, { dateColumn: config.dateColumn, limit: 500 });
  return {
    stats: {
      total: rows.length,
      failed: rows.filter((row) => ["failed", "error"].includes(String(row.status ?? "").toLowerCase())).length,
      active_clients: new Set(rows.map((row) => row.tenant_id).filter(Boolean)).size,
    },
    rows,
    title: config.title,
  };
}

export async function getAdminClientNotes(tenantId: string) {
  const rows = await loadRows("admin_client_notes", { tenantIds: [tenantId] }, { dateColumn: "", limit: 100 });
  return { rows };
}

export async function addAdminClientNote(tenantId: string, note: string, adminUserId: string, pinned = false) {
  const svc = requireService();
  const payload = {
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    note,
    created_by: adminUserId,
    pinned,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await svc.from("admin_client_notes").insert(payload).select().maybeSingle();
  if (error) throw error;
  return data;
}

export async function recordAdminImpersonationAudit(input: {
  adminUserId: string;
  tenantId: string;
  action: "started" | "stopped" | "deep_link" | "opened_tab";
  targetUserId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const svc = requireService();
  const payload = {
    id: crypto.randomUUID(),
    admin_user_id: input.adminUserId,
    target_user_id: input.targetUserId ?? null,
    tenant_id: input.tenantId,
    action: input.action,
    metadata_json: input.metadata ?? {},
    created_at: new Date().toISOString(),
  };
  const { data, error } = await svc.from("admin_impersonation_audit").insert(payload).select().maybeSingle();
  if (error && isSchemaCompatibilityError(error)) return payload;
  if (error) throw error;
  return data ?? payload;
}

export { ADMIN_MODULES };

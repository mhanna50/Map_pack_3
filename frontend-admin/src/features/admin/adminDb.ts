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

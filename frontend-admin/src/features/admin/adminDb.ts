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

const logAdminMonitoringError = (source: string, error: unknown) => {
  console.error(`[admin-monitoring] ${source} failed`, serializeUnknownError(error));
};

export type AdminUser = { id: string; email?: string | null; role?: string | null; tenant_id?: string | null };
type AdminRolesUser = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  role: string;
  role_sources: string[];
  tenants: Array<{
    tenant_id: string;
    business_name: string;
    status: string | null;
    role: string;
    is_primary: boolean;
  }>;
  default_tenant_id: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
  is_current_admin: boolean;
};
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

  const metadataRoles = authMetadataRoles(user as unknown as Record<string, unknown>);
  if (metadataRoles.some(isAdminLikeRole)) {
    const role = metadataRoles.includes("owner_admin")
      ? "owner_admin"
      : metadataRoles.includes("super_admin") || metadataRoles.includes("superadmin")
        ? "super_admin"
        : metadataRoles.includes("staff")
          ? "staff"
          : "admin";
    logAuthRouting("admin_guard.auth_metadata_resolution", {
      userId: user.id,
      email: user.email,
      role,
      source: "auth_metadata",
    });
    return { id: user.id, email: user.email, role, tenant_id: null };
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

async function safeSelectAll(table: string, limit = 10000): Promise<Record<string, unknown>[]> {
  try {
    const svc = requireService();
    const { data, error } = await svc.from(table).select("*").limit(limit);
    if (error && isSchemaCompatibilityError(error)) return [];
    if (error) throw error;
    return (data ?? []) as Record<string, unknown>[];
  } catch (error) {
    if (isSchemaCompatibilityError(error)) return [];
    throw error;
  }
}

async function listAuthUsersForRoles(): Promise<Record<string, unknown>[]> {
  const svc = requireService();
  const users: Record<string, unknown>[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await svc.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) {
      logAdminMonitoringError("auth.admin.listUsers", error);
      break;
    }
    const pageUsers = (data?.users ?? []) as unknown as Record<string, unknown>[];
    users.push(...pageUsers);
    if (pageUsers.length < 1000) break;
  }
  return users;
}

function stringField(row: Record<string, unknown> | undefined, key: string): string | null {
  const value = row?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function boolField(row: Record<string, unknown> | undefined, key: string): boolean {
  return row?.[key] === true;
}

function normalizeRole(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim().toLowerCase() : null;
}

function authMetadataRoles(row: Record<string, unknown> | undefined) {
  const metadata = row?.app_metadata;
  if (!metadata || typeof metadata !== "object") return [];
  const record = metadata as Record<string, unknown>;
  const roles = new Set<string>();
  const singleRole = normalizeRole(record.role ?? record.app_role);
  if (singleRole) roles.add(singleRole);
  if (Array.isArray(record.roles)) {
    record.roles.forEach((role) => {
      const normalized = normalizeRole(role);
      if (normalized) roles.add(normalized);
    });
  }
  return [...roles];
}

function isAdminLikeRole(role: string | null) {
  return Boolean(role && ["owner_admin", "owner", "admin", "super_admin", "superadmin", "staff"].includes(role));
}

export async function getAdminRolesOverview(currentAdmin?: AdminUser) {
  const admin = currentAdmin ?? (await requireAdminUser());
  const [authUsers, profiles, memberships, tenants, publicUsers] = await Promise.all([
    listAuthUsersForRoles(),
    safeSelectAll("profiles"),
    safeSelectAll("memberships"),
    safeSelectAll("tenants"),
    safeSelectAll("users"),
  ]);

  const profileByUser = new Map(profiles.map((row) => [String(row.user_id), row]));
  const publicUserById = new Map(publicUsers.map((row) => [String(row.id), row]));
  const tenantById = new Map(tenants.map((row) => [String(row.tenant_id), row]));
  const membershipsByUser = new Map<string, Record<string, unknown>[]>();
  memberships.forEach((membership) => {
    const userId = String(membership.user_id ?? "");
    if (!userId) return;
    const current = membershipsByUser.get(userId) ?? [];
    current.push(membership);
    membershipsByUser.set(userId, current);
  });

  const authUserIds = new Set(authUsers.map((row) => String(row.id ?? "")).filter(Boolean));
  const orphanedProfileRows = profiles.filter((row) => {
    const userId = String(row.user_id ?? "");
    return userId && !authUserIds.has(userId);
  }).length;
  const orphanedMembershipRows = memberships.filter((row) => {
    const userId = String(row.user_id ?? "");
    return userId && !authUserIds.has(userId);
  }).length;
  const orphanedPublicUserRows = publicUsers.filter((row) => {
    const userId = String(row.id ?? "");
    return userId && !authUserIds.has(userId);
  }).length;
  const userIds = new Set<string>([
    ...authUserIds,
    ...(authUserIds.has(admin.id) ? [admin.id] : []),
  ]);

  const rows: AdminRolesUser[] = [...userIds].map((userId) => {
    const authUser = authUsers.find((row) => String(row.id ?? "") === userId);
    const profile = profileByUser.get(userId);
    const publicUser = publicUserById.get(userId);
    const userMemberships = membershipsByUser.get(userId) ?? [];
    const sourceRoles = [
      ...authMetadataRoles(authUser),
      normalizeRole(profile?.role),
      normalizeRole(publicUser?.role),
      ...userMemberships.map((membership) => normalizeRole(membership.app_role ?? membership.role)),
      boolField(publicUser, "is_staff") ? "staff" : null,
      userId === admin.id ? normalizeRole(admin.role ?? "owner_admin") : null,
    ].filter(Boolean) as string[];
    const isAdmin = sourceRoles.some(isAdminLikeRole);
    const primaryRole = isAdmin
      ? sourceRoles.includes("owner_admin")
        ? "owner_admin"
        : sourceRoles.includes("super_admin") || sourceRoles.includes("superadmin")
          ? "super_admin"
          : sourceRoles.includes("staff")
            ? "staff"
            : "admin"
      : userMemberships.length
        ? "client"
        : "unassigned";
    const roleSources = [
      authMetadataRoles(authUser).length ? "auth metadata" : null,
      profile ? "profile" : null,
      publicUser ? "public users" : null,
      userMemberships.length ? "memberships" : null,
      userId === admin.id ? "current session" : null,
    ].filter(Boolean) as string[];
    const tenantRows = userMemberships.map((membership) => {
      const tenantId = String(membership.tenant_id ?? "");
      const tenant = tenantById.get(tenantId);
      return {
        tenant_id: tenantId,
        business_name: String(tenant?.business_name ?? tenantId),
        status: stringField(tenant, "status"),
        role: normalizeRole(membership.app_role ?? membership.role) ?? "client",
        is_primary: membership.is_primary === true,
      };
    });
    const defaultTenantId = stringField(profile, "default_tenant_id") ?? stringField(profile, "tenant_id");

    return {
      user_id: userId,
      email: stringField(authUser, "email") ?? stringField(profile, "email") ?? stringField(publicUser, "email") ?? (userId === admin.id ? (admin.email ?? null) : null),
      full_name: stringField(profile, "full_name") ?? stringField(publicUser, "full_name"),
      role: primaryRole,
      role_sources: roleSources.length ? roleSources : ["current session"],
      tenants: tenantRows,
      default_tenant_id: defaultTenantId,
      created_at: stringField(authUser, "created_at") ?? stringField(profile, "created_at") ?? stringField(publicUser, "created_at"),
      last_sign_in_at: stringField(authUser, "last_sign_in_at"),
      is_current_admin: userId === admin.id,
    };
  });

  rows.sort((a, b) => {
    if (a.is_current_admin) return -1;
    if (b.is_current_admin) return 1;
    const roleRank = (role: string) => (isAdminLikeRole(role) ? 0 : role === "client" ? 1 : 2);
    return roleRank(a.role) - roleRank(b.role) || String(a.email ?? a.user_id).localeCompare(String(b.email ?? b.user_id));
  });

  return {
    current_admin: { id: admin.id, email: admin.email ?? null, role: admin.role ?? "owner_admin" },
    stats: {
      total_users: rows.length,
      admins: rows.filter((row) => isAdminLikeRole(row.role)).length,
      clients: rows.filter((row) => row.role === "client").length,
      unassigned: rows.filter((row) => row.role === "unassigned").length,
      tenant_memberships: rows.reduce((sum, row) => sum + (row.tenants?.length ?? 0), 0),
      orphaned_app_rows: orphanedProfileRows + orphanedMembershipRows + orphanedPublicUserRows,
      orphaned_profile_rows: orphanedProfileRows,
      orphaned_membership_rows: orphanedMembershipRows,
      orphaned_public_user_rows: orphanedPublicUserRows,
    },
    rows,
  };
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

const ORG_SCOPED_DELETE_TABLES = [
  "post_attempts",
  "post_jobs",
  "gbp_post_keyword_mappings",
  "media_assets",
  "content_items",
  "posts",
  "content_plans",
  "geo_grid_scan_points",
  "geo_grid_scans",
  "keyword_scores",
  "keyword_candidates",
  "keyword_campaign_cycles",
  "keyword_dashboard_aggregates",
  "selected_keywords",
  "business_services",
  "actions",
  "alerts",
  "audit_logs",
  "campaign_job_runs",
  "client_uploads",
  "connected_accounts",
  "gbp_optimization_actions",
  "locations",
  "org_settings",
  "organization_invites",
  "photo_requests",
  "rate_limit_state",
] as const;

type StripeCancelResult = { subscriptionId: string; canceled: boolean; skipped?: boolean; reason?: string };

async function deleteWhere(table: string, column: string, value: string) {
  const svc = requireService();
  const { error } = await svc.from(table).delete().eq(column, value);
  if (error && !isSchemaCompatibilityError(error)) throw error;
}

async function cancelStripeSubscriptionsForTenant(tenantId: string): Promise<StripeCancelResult[]> {
  const svc = requireService();
  const { data, error } = await svc
    .from("billing_subscriptions")
    .select("id,stripe_subscription_id,status,metadata_json")
    .eq("tenant_id", tenantId);
  if (error && !isSchemaCompatibilityError(error)) throw error;
  const rows = (data ?? []) as Record<string, unknown>[];
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const results: StripeCancelResult[] = [];

  for (const row of rows) {
    const subscriptionId = String(row.stripe_subscription_id ?? "").trim();
    const status = String(row.status ?? "").toLowerCase();
    if (!subscriptionId) {
      results.push({ subscriptionId: "", canceled: false, skipped: true, reason: "missing_subscription_id" });
      continue;
    }
    if (["canceled", "incomplete_expired"].includes(status)) {
      results.push({ subscriptionId, canceled: false, skipped: true, reason: "already_inactive" });
      continue;
    }
    if (!secretKey) {
      results.push({ subscriptionId, canceled: false, reason: "stripe_secret_missing" });
      continue;
    }

    const response = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${secretKey}`,
      },
    });
    if (!response.ok) {
      let reason = `stripe_cancel_failed_${response.status}`;
      try {
        const body = (await response.json()) as { error?: { code?: string; type?: string } };
        reason = body.error?.code || body.error?.type || reason;
      } catch {
        // Keep sanitized status-only reason if Stripe does not return JSON.
      }
      results.push({ subscriptionId, canceled: false, reason });
      continue;
    }
    results.push({ subscriptionId, canceled: true });
  }

  const updateResults = await Promise.all(rows.map((row) => {
    const metadata = row.metadata_json && typeof row.metadata_json === "object" ? row.metadata_json as Record<string, unknown> : {};
    return svc
      .from("billing_subscriptions")
      .update({
        status: "canceled",
        canceled_at: new Date().toISOString(),
        metadata_json: {
          ...metadata,
          admin_terminated: true,
        },
      })
      .eq("id", row.id);
  }));
  updateResults.forEach((result) => {
    if (result.error && !isSchemaCompatibilityError(result.error)) throw result.error;
  });

  return results;
}

async function collectTenantAuthUsersForTermination(tenantId: string, currentAdminId?: string) {
  const [memberships, profiles, publicUsers, pendingOnboarding, allMemberships, authUsers] = await Promise.all([
    safeSelectAll("memberships"),
    safeSelectAll("profiles"),
    safeSelectAll("users"),
    safeSelectAll("pending_onboarding"),
    safeSelectAll("memberships"),
    listAuthUsersForRoles(),
  ]);
  const tenantMemberships = memberships.filter((row) => String(row.tenant_id ?? "") === tenantId);
  const tenantProfiles = profiles.filter((row) => String(row.tenant_id ?? row.default_tenant_id ?? "") === tenantId);
  const tenantPending = pendingOnboarding.filter((row) => String(row.tenant_id ?? "") === tenantId);
  const candidateIds = new Set<string>();
  const candidateEmails = new Set<string>();

  tenantMemberships.forEach((row) => {
    const userId = String(row.user_id ?? "");
    if (userId) candidateIds.add(userId);
  });
  tenantProfiles.forEach((row) => {
    const userId = String(row.user_id ?? "");
    const email = String(row.email ?? "").toLowerCase();
    if (userId) candidateIds.add(userId);
    if (email) candidateEmails.add(email);
  });
  tenantPending.forEach((row) => {
    const email = String(row.email ?? "").toLowerCase();
    if (email) candidateEmails.add(email);
  });
  publicUsers.forEach((row) => {
    const userId = String(row.id ?? "");
    const email = String(row.email ?? "").toLowerCase();
    if (candidateIds.has(userId) || (email && candidateEmails.has(email))) {
      if (userId) candidateIds.add(userId);
      if (email) candidateEmails.add(email);
    }
  });
  authUsers.forEach((row) => {
    const userId = String(row.id ?? "");
    const email = String(row.email ?? "").toLowerCase();
    if (candidateIds.has(userId) || (email && candidateEmails.has(email))) {
      if (userId) candidateIds.add(userId);
      if (email) candidateEmails.add(email);
    }
  });

  const allMembershipsByUser = new Map<string, Record<string, unknown>[]>();
  allMemberships.forEach((row) => {
    const userId = String(row.user_id ?? "");
    if (!userId) return;
    allMembershipsByUser.set(userId, [...(allMembershipsByUser.get(userId) ?? []), row]);
  });
  const profileByUser = new Map(profiles.map((row) => [String(row.user_id ?? ""), row]));
  const publicUserById = new Map(publicUsers.map((row) => [String(row.id ?? ""), row]));
  const authUserById = new Map(authUsers.map((row) => [String(row.id ?? ""), row]));

  const deletableUserIds: string[] = [];
  const skippedUserIds: Array<{ userId: string; reason: string }> = [];
  candidateIds.forEach((userId) => {
    if (!userId) return;
    if (currentAdminId && userId === currentAdminId) {
      skippedUserIds.push({ userId, reason: "current_admin" });
      return;
    }
    const profile = profileByUser.get(userId);
    const publicUser = publicUserById.get(userId);
    const authUser = authUserById.get(userId);
    const roles = [
      normalizeRole(profile?.role),
      normalizeRole(publicUser?.role),
      ...authMetadataRoles(authUser),
    ].filter(Boolean) as string[];
    if (roles.some(isAdminLikeRole) || publicUser?.is_staff === true) {
      skippedUserIds.push({ userId, reason: "admin_or_staff" });
      return;
    }
    const otherMemberships = (allMembershipsByUser.get(userId) ?? []).filter((row) => String(row.tenant_id ?? "") !== tenantId);
    if (otherMemberships.length > 0) {
      skippedUserIds.push({ userId, reason: "other_tenant_memberships" });
      return;
    }
    deletableUserIds.push(userId);
  });

  return { deletableUserIds, skippedUserIds };
}

async function deleteAuthUsers(userIds: string[]) {
  const svc = requireService();
  let deleted = 0;
  const failed: Array<{ userId: string; reason: string }> = [];
  for (const userId of userIds) {
    const { error } = await svc.auth.admin.deleteUser(userId);
    if (error) {
      failed.push({ userId, reason: error.message || "auth_delete_failed" });
      continue;
    }
    deleted += 1;
  }
  return { deleted, failed };
}

export async function terminateTenantAccount(id: string, options: { currentAdminId?: string } = {}) {
  const tenantId = String(id ?? "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tenantId)) {
    throw new Error("Invalid tenant id");
  }

  const svc = requireService();
  const [{ data: tenant, error: tenantError }, { data: organization, error: orgError }] = await Promise.all([
    svc.from("tenants").select("tenant_id,business_name,status").eq("tenant_id", tenantId).maybeSingle(),
    svc.from("organizations").select("id,name").eq("id", tenantId).maybeSingle(),
  ]);
  if (tenantError && !isSchemaCompatibilityError(tenantError)) throw tenantError;
  if (orgError && !isSchemaCompatibilityError(orgError)) throw orgError;
  if (!tenant && !organization) throw new Error("Tenant not found");

  const [stripeResults, authUsers] = await Promise.all([
    cancelStripeSubscriptionsForTenant(tenantId),
    collectTenantAuthUsersForTermination(tenantId, options.currentAdminId),
  ]);
  const stripeFailures = stripeResults.filter((result) => !result.canceled && !result.skipped);
  if (stripeFailures.length > 0) {
    throw new Error(`Unable to cancel Stripe billing: ${stripeFailures.map((result) => result.reason ?? "unknown").join(", ")}`);
  }

  const authDeleteResult = await deleteAuthUsers(authUsers.deletableUserIds);

  for (const table of ORG_SCOPED_DELETE_TABLES) {
    await deleteWhere(table, "organization_id", tenantId);
  }

  await deleteWhere("pending_onboarding", "tenant_id", tenantId);
  await deleteWhere("memberships", "tenant_id", tenantId);
  await deleteWhere("admin_impersonation_audit", "tenant_id", tenantId);
  await deleteWhere("profiles", "tenant_id", tenantId);
  await deleteWhere("profiles", "default_tenant_id", tenantId);
  await deleteWhere("users", "tenant_id", tenantId);

  const tenantDelete = await svc.from("tenants").delete().eq("tenant_id", tenantId);
  if (tenantDelete.error && !isSchemaCompatibilityError(tenantDelete.error)) throw tenantDelete.error;

  const orgDelete = await svc.from("organizations").delete().eq("id", tenantId);
  if (orgDelete.error && !isSchemaCompatibilityError(orgDelete.error)) throw orgDelete.error;

  return {
    terminated: true,
    tenant_id: tenantId,
    stripe: {
      canceled: stripeResults.filter((result) => result.canceled).length,
      skipped: stripeResults.filter((result) => result.skipped).length,
      failed: stripeResults.filter((result) => !result.canceled && !result.skipped).map((result) => result.reason),
    },
    auth: {
      deletedUsers: authDeleteResult.deleted,
      skippedUsers: authUsers.skippedUserIds.length,
      failedUsers: authDeleteResult.failed.length,
    },
  };
}

export async function fetchBilling() {
  const svc = requireService();
  const { data, error } = await svc.from("billing_subscriptions").select().order("current_period_end", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as Record<string, unknown>[];
  const tenants = await safeSelectAll("tenants");
  const tenantById = new Map(tenants.map((tenant) => [String(tenant.tenant_id), tenant]));
  await ensureCurrentRevenueLedger(rows, tenantById);
  const [expenses, settings, ledger] = await Promise.all([
    loadAdminBusinessExpenses(),
    loadAdminFinanceSettings(),
    loadClientRevenueLedger(),
  ]);
  const paymentIssues = rows
    .filter((row) => isBillingIssueStatus(String(row.status ?? "")))
    .map((row) => {
      const tenant = tenantById.get(String(row.tenant_id ?? ""));
      return {
        ...row,
        client_name: tenant?.business_name ?? row.tenant_id,
        account_paused: Boolean(tenant?.posting_paused ?? tenant?.is_active === false),
      };
    });
  return {
    rows,
    payment_issues: paymentIssues,
    expenses,
    finance_settings: settings,
    monthly_summary: buildBillingMonthlySummary({ subscriptions: rows, ledger, expenses, settings, tenantById }),
    lifetime_client_revenue: buildLifetimeClientRevenue(ledger),
  };
}

function startOfMonth(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

function asNumber(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function dollarsToCents(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 100)) : 0;
}

function centsToDollars(cents: number) {
  return Math.round(cents) / 100;
}

function normalizePlanKey(value: unknown) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function priceCentsForPlan(plan: unknown, row?: Record<string, unknown>) {
  const metadata = row?.metadata_json && typeof row.metadata_json === "object" ? (row.metadata_json as Record<string, unknown>) : {};
  const metadataAmount = metadata.amount_cents ?? metadata.unit_amount ?? metadata.price_amount;
  const rowAmount = row?.amount_cents ?? row?.unit_amount ?? row?.price_amount ?? row?.amount;
  const direct = asNumber(metadataAmount ?? rowAmount, NaN);
  if (Number.isFinite(direct) && direct > 0) return direct;

  const key = normalizePlanKey(plan);
  const byPlan = key ? asNumber(process.env[`STRIPE_PRICE_AMOUNT_${key}`], NaN) : NaN;
  if (Number.isFinite(byPlan) && byPlan >= 0) return byPlan;
  const fallback = asNumber(process.env.STRIPE_PRICE_AMOUNT, NaN);
  return Number.isFinite(fallback) && fallback >= 0 ? fallback : 0;
}

function isRevenueStatus(status: string) {
  return ["active", "trialing"].includes(status.toLowerCase());
}

function isBillingIssueStatus(status: string) {
  return ["past_due", "unpaid", "incomplete", "incomplete_expired", "paused", "canceled", "churned"].includes(status.toLowerCase());
}

async function ensureCurrentRevenueLedger(rows: Record<string, unknown>[], tenantById: Map<string, Record<string, unknown>>) {
  const svc = requireService();
  const periodMonth = startOfMonth();
  const ledgerRows = rows
    .filter((row) => isRevenueStatus(String(row.status ?? "")))
    .map((row) => {
      const tenantId = String(row.tenant_id ?? "");
      const tenant = tenantById.get(tenantId);
      const subscriptionId = row.stripe_subscription_id ? String(row.stripe_subscription_id) : "";
      return {
        tenant_id: tenantId || null,
        client_name: String(tenant?.business_name ?? (tenantId || "Client")),
        stripe_subscription_id: subscriptionId || null,
        plan: row.plan ? String(row.plan) : null,
        status: row.status ? String(row.status) : null,
        amount_cents: Math.round(priceCentsForPlan(row.plan, row)),
        currency: "usd",
        period_month: periodMonth,
        source: "subscription_snapshot",
        ledger_key: `subscription_snapshot:${periodMonth}:${subscriptionId || tenantId}`,
        occurred_at: new Date().toISOString(),
        metadata_json: { captured_by: "admin_billing_dashboard" },
      };
    })
    .filter((row) => row.amount_cents > 0);
  if (!ledgerRows.length) return;
  const { error } = await svc
    .from("client_revenue_ledger")
    .upsert(ledgerRows, { onConflict: "ledger_key" });
  if (error && !isSchemaCompatibilityError(error)) {
    logAdminMonitoringError("client_revenue_ledger.upsert", error);
  }
}

async function loadAdminBusinessExpenses() {
  try {
    const svc = requireService();
    const { data, error } = await svc.from("admin_business_expenses").select("*").order("occurred_on", { ascending: false });
    if (error && isSchemaCompatibilityError(error)) return [];
    if (error) throw error;
    return (data ?? []) as Record<string, unknown>[];
  } catch (error) {
    if (isSchemaCompatibilityError(error)) return [];
    throw error;
  }
}

async function loadAdminFinanceSettings() {
  const defaults = {
    id: true,
    pa_income_tax_rate: 0.0307,
    federal_income_tax_rate: 0,
    self_employment_tax_rate: 0.153,
    self_employment_taxable_ratio: 0.9235,
    local_tax_rate: 0,
    additional_tax_rate: 0,
  };
  try {
    const svc = requireService();
    const { data, error } = await svc.from("admin_finance_settings").select("*").eq("id", true).maybeSingle();
    if (error && isSchemaCompatibilityError(error)) return defaults;
    if (error) throw error;
    return { ...defaults, ...(data ?? {}) } as Record<string, unknown>;
  } catch (error) {
    if (isSchemaCompatibilityError(error)) return defaults;
    throw error;
  }
}

async function loadClientRevenueLedger() {
  try {
    const svc = requireService();
    const { data, error } = await svc.from("client_revenue_ledger").select("*").order("period_month", { ascending: false }).limit(5000);
    if (error && isSchemaCompatibilityError(error)) return [];
    if (error) throw error;
    return (data ?? []) as Record<string, unknown>[];
  } catch (error) {
    if (isSchemaCompatibilityError(error)) return [];
    throw error;
  }
}

function monthKey(value: unknown) {
  const date = new Date(String(value ?? ""));
  if (Number.isNaN(date.getTime())) return startOfMonth();
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

function expenseAppliesToMonth(expense: Record<string, unknown>, month: string) {
  const type = String(expense.expense_type ?? "one_time");
  if (type !== "recurring") return monthKey(expense.occurred_on) === month;
  const monthDate = new Date(`${month}T00:00:00.000Z`);
  const starts = expense.starts_on ? new Date(`${expense.starts_on}T00:00:00.000Z`) : new Date(`${monthKey(expense.occurred_on)}T00:00:00.000Z`);
  const ends = expense.ends_on ? new Date(`${expense.ends_on}T00:00:00.000Z`) : null;
  return monthDate >= starts && (!ends || monthDate <= ends);
}

function expenseMonthlyCents(expense: Record<string, unknown>) {
  const amount = asNumber(expense.amount_cents);
  const interval = String(expense.recurrence_interval ?? "monthly");
  if (String(expense.expense_type ?? "one_time") !== "recurring") return amount;
  if (interval === "quarterly") return amount / 3;
  if (interval === "yearly") return amount / 12;
  return amount;
}

function calculateTaxCents(profitBeforeTaxCents: number, settings: Record<string, unknown>) {
  const taxable = Math.max(0, profitBeforeTaxCents);
  const pa = taxable * asNumber(settings.pa_income_tax_rate, 0.0307);
  const federal = taxable * asNumber(settings.federal_income_tax_rate);
  const local = taxable * asNumber(settings.local_tax_rate);
  const additional = taxable * asNumber(settings.additional_tax_rate);
  const selfEmployment =
    taxable *
    asNumber(settings.self_employment_taxable_ratio, 0.9235) *
    asNumber(settings.self_employment_tax_rate, 0.153);
  return Math.round(pa + federal + local + additional + selfEmployment);
}

function buildBillingMonthlySummary(input: {
  subscriptions: Record<string, unknown>[];
  ledger: Record<string, unknown>[];
  expenses: Record<string, unknown>[];
  settings: Record<string, unknown>;
  tenantById: Map<string, Record<string, unknown>>;
}) {
  const months = new Set<string>([startOfMonth()]);
  input.ledger.forEach((row) => months.add(monthKey(row.period_month)));
  input.expenses.forEach((row) => {
    months.add(monthKey(row.occurred_on));
    if (row.starts_on) months.add(monthKey(row.starts_on));
  });
  const sortedMonths = [...months].sort().reverse().slice(0, 24);
  return sortedMonths.map((month) => {
    const revenueRows = input.ledger.filter((row) => monthKey(row.period_month) === month);
    const grossRevenueCents = revenueRows.reduce((sum, row) => sum + asNumber(row.amount_cents), 0);
    const monthExpenses = input.expenses.filter((expense) => expenseAppliesToMonth(expense, month));
    const recurringExpenseCents = monthExpenses
      .filter((expense) => String(expense.expense_type) === "recurring")
      .reduce((sum, expense) => sum + expenseMonthlyCents(expense), 0);
    const oneTimeExpenseCents = monthExpenses
      .filter((expense) => String(expense.expense_type) !== "recurring")
      .reduce((sum, expense) => sum + expenseMonthlyCents(expense), 0);
    const profitBeforeTaxCents = Math.round(grossRevenueCents - recurringExpenseCents - oneTimeExpenseCents);
    const taxSetAsideCents = calculateTaxCents(profitBeforeTaxCents, input.settings);
    const netAfterTaxAndExpensesCents = profitBeforeTaxCents - taxSetAsideCents;
    return {
      month,
      gross_revenue: centsToDollars(grossRevenueCents),
      recurring_expenses: centsToDollars(recurringExpenseCents),
      one_time_expenses: centsToDollars(oneTimeExpenseCents),
      profit_before_tax: centsToDollars(profitBeforeTaxCents),
      tax_set_aside: centsToDollars(taxSetAsideCents),
      net_after_tax_and_expenses: centsToDollars(netAfterTaxAndExpensesCents),
      paying_clients: new Set(revenueRows.map((row) => row.tenant_id ?? row.client_name).filter(Boolean)).size,
      revenue_lines: revenueRows.map((row) => ({
        source: row.source ?? "subscription_snapshot",
        client_name: row.client_name ?? row.tenant_id ?? "Client",
        plan: row.plan ?? null,
        status: row.status ?? null,
        stripe_subscription_id: row.stripe_subscription_id ?? null,
        amount: centsToDollars(asNumber(row.amount_cents)),
        occurred_at: row.occurred_at ?? row.created_at ?? null,
      })),
      expense_lines: monthExpenses.map((expense) => ({
        id: expense.id,
        name: expense.name,
        category: expense.category,
        expense_type: expense.expense_type,
        recurrence_interval: expense.recurrence_interval,
        amount: centsToDollars(expenseMonthlyCents(expense)),
        original_amount: centsToDollars(asNumber(expense.amount_cents)),
        occurred_on: expense.occurred_on,
        starts_on: expense.starts_on,
        ends_on: expense.ends_on,
      })),
    };
  });
}

function buildLifetimeClientRevenue(ledger: Record<string, unknown>[]) {
  const byClient = new Map<string, { tenant_id: string | null; client_name: string; total_cents: number; months: number }>();
  ledger.forEach((row) => {
    const key = String(row.tenant_id ?? row.client_name ?? row.stripe_subscription_id ?? row.id);
    const current = byClient.get(key) ?? {
      tenant_id: row.tenant_id ? String(row.tenant_id) : null,
      client_name: String(row.client_name ?? row.tenant_id ?? "Client"),
      total_cents: 0,
      months: 0,
    };
    current.total_cents += asNumber(row.amount_cents);
    current.months += 1;
    byClient.set(key, current);
  });
  return [...byClient.values()]
    .map((row) => ({ ...row, total_revenue: centsToDollars(row.total_cents) }))
    .sort((a, b) => b.total_cents - a.total_cents);
}

export async function saveAdminFinanceSettings(input: Record<string, unknown>) {
  const svc = requireService();
  const payload = {
    id: true,
    pa_income_tax_rate: asNumber(input.pa_income_tax_rate, 0.0307),
    federal_income_tax_rate: asNumber(input.federal_income_tax_rate),
    self_employment_tax_rate: asNumber(input.self_employment_tax_rate, 0.153),
    self_employment_taxable_ratio: asNumber(input.self_employment_taxable_ratio, 0.9235),
    local_tax_rate: asNumber(input.local_tax_rate),
    additional_tax_rate: asNumber(input.additional_tax_rate),
    notes: typeof input.notes === "string" ? input.notes.slice(0, 1000) : null,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await svc.from("admin_finance_settings").upsert(payload).select().maybeSingle();
  if (error) throw error;
  return data ?? payload;
}

export async function addAdminBusinessExpense(input: Record<string, unknown>) {
  const svc = requireService();
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) throw new Error("Expense name is required");
  const expenseType = input.expense_type === "recurring" ? "recurring" : "one_time";
  const payload = {
    id: crypto.randomUUID(),
    name: name.slice(0, 200),
    category: typeof input.category === "string" ? input.category.slice(0, 100) : null,
    amount_cents: dollarsToCents(input.amount),
    expense_type: expenseType,
    recurrence_interval: expenseType === "recurring" ? String(input.recurrence_interval ?? "monthly") : null,
    occurred_on: typeof input.occurred_on === "string" && input.occurred_on ? input.occurred_on : new Date().toISOString().slice(0, 10),
    starts_on: typeof input.starts_on === "string" && input.starts_on ? input.starts_on : null,
    ends_on: typeof input.ends_on === "string" && input.ends_on ? input.ends_on : null,
    notes: typeof input.notes === "string" ? input.notes.slice(0, 1000) : null,
  };
  const { data, error } = await svc.from("admin_business_expenses").insert(payload).select().maybeSingle();
  if (error) throw error;
  return data ?? payload;
}

export async function deleteAdminBusinessExpense(id: string) {
  const svc = requireService();
  const { error } = await svc.from("admin_business_expenses").delete().eq("id", id);
  if (error) throw error;
  return { deleted: true };
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
  { id: "visibility", label: "Rank Tracking", clientPath: "/dashboard/keywords" },
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
    const dateColumn = options.dateColumn ?? "created_at";
    let query = svc.from(table).select("*").limit(options.limit ?? 500);
    if (dateColumn) query = query.order(dateColumn, { ascending: false });
    if (filters.tenantIds?.length) query = query.in("tenant_id", filters.tenantIds);
    if (dateColumn) query = query.gte(dateColumn, from).lte(dateColumn, to);
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
    moduleHealth("visibility", "Rank Tracking", hasLocations.size, tenantCount, ranks.count, 0),
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
  const integrationFilters = { ...filters, tenantIds: filters.tenantIds };
  const [billing, pending, leadSettings, leads, ownerNotifications, posts, reviewRequests, reviews, activity, jobs, alerts, integrationHealth, integrationIncidents, reconnectPrompts] =
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
      loadRows("integration_health_checks", integrationFilters, { dateColumn: "last_checked_at", limit: 1000 }),
      loadRows("integration_incidents", integrationFilters, { dateColumn: "last_seen_at", limit: 1000 }),
      loadRows("client_reconnect_prompts", integrationFilters, { dateColumn: "created_at", limit: 500 }),
    ]);
  const moduleHealth = await buildModuleHealth(tenants, scopedFilters);
  const activeClients = tenants.filter((tenant) => String(tenant.status ?? "").toLowerCase() === "active").length;
  const inactiveBilling = Array.from(billing.values()).filter((row) => !["active", "trialing"].includes(String(row.status ?? "").toLowerCase())).length;
  const leadSetupIssues = leadSettings.filter((row) => row.enabled === true && (!row.twilio_phone_number || !leadRecoveryIsActive(row))).length;
  const failedJobs = jobs.filter((job) => ["failed", "dead_lettered"].includes(String(job.status ?? "").toLowerCase())).length;
  const openAlerts = alerts.filter((alert) => String(alert.status ?? "").toLowerCase() !== "resolved").length;
  const openIntegrationIncidents = integrationIncidents.filter((row) => ["open", "investigating"].includes(String(row.status ?? "").toLowerCase()));
  const activeCriticalIncidents = openIntegrationIncidents.filter((row) => row.severity === "critical").length;
  const activeWarningIncidents = openIntegrationIncidents.filter((row) => row.severity === "warning").length;
  const failingIntegrations = integrationHealth.filter((row) => ["failing", "misconfigured", "needs_reauth", "disconnected"].includes(String(row.status ?? "").toLowerCase())).length;
  const degradedIntegrations = integrationHealth.filter((row) => row.status === "degraded").length;
  const clientsNeedingReconnect = reconnectPrompts.filter((row) => row.status === "active").length;
  const platformHealthStatus = activeCriticalIncidents ? "critical" : activeWarningIncidents || failingIntegrations || degradedIntegrations ? "warning" : "healthy";
  const attention = buildAttentionList({
    tenants,
    billing,
    leadSettings,
    failedJobs,
    openAlerts,
    integrationIncidents: openIntegrationIncidents,
    reconnectPrompts,
  });

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
      platform_health_status: platformHealthStatus,
      active_critical_incidents: activeCriticalIncidents,
      active_warning_incidents: activeWarningIncidents,
      failing_integrations: failingIntegrations,
      degraded_integrations: degradedIntegrations,
      clients_needing_reconnect: clientsNeedingReconnect,
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
  integrationIncidents?: Record<string, unknown>[];
  reconnectPrompts?: Record<string, unknown>[];
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
  (input.integrationIncidents ?? []).slice(0, 25).forEach((incident) => {
    const tenantId = String(incident.tenant_id ?? "");
    issues.push({
      severity: incident.severity ?? "warning",
      tenant_id: tenantId || undefined,
      client: tenantId ? tenantName.get(tenantId) : "Platform-wide",
      title: incident.title ?? incident.message ?? "Integration incident",
      module: incident.module ?? incident.integration ?? "integration_health",
    });
  });
  const activeReconnects = (input.reconnectPrompts ?? []).filter((prompt) => prompt.status === "active");
  if (activeReconnects.length > 0) {
    issues.push({
      severity: "warning",
      title: `${activeReconnects.length} clients need Google reconnect`,
      module: "google_business_profile",
    });
  }
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
  const [billingResult, moduleHealthResult, leadSettingsResult, activityResult, prospectsResult] = await Promise.allSettled([
    loadBillingByTenant(tenantIds),
    buildModuleHealth(tenants, { ...filters, tenantIds }),
    loadRows("lead_recovery_settings", { ...filters, tenantIds }, { dateColumn: "", limit: 10000 }),
    loadRows("client_activity_events", { ...filters, tenantIds }, { limit: 500 }),
    loadProspectiveClientsForMonitoring(filters),
  ]);
  const billing =
    billingResult.status === "fulfilled"
      ? billingResult.value
      : (logAdminMonitoringError("loadBillingByTenant", billingResult.reason), new Map<string, Record<string, unknown>>());
  const moduleHealthRows =
    moduleHealthResult.status === "fulfilled"
      ? moduleHealthResult.value
      : (logAdminMonitoringError("buildModuleHealth", moduleHealthResult.reason), ADMIN_MODULES.map((module) => moduleHealth(module.id, module.label, 0, tenants.length, 0, 0)));
  const leadSettings =
    leadSettingsResult.status === "fulfilled"
      ? leadSettingsResult.value
      : (logAdminMonitoringError("lead_recovery_settings", leadSettingsResult.reason), []);
  const activity =
    activityResult.status === "fulfilled"
      ? activityResult.value
      : (logAdminMonitoringError("client_activity_events", activityResult.reason), []);
  const prospects =
    prospectsResult.status === "fulfilled"
      ? prospectsResult.value
      : (logAdminMonitoringError("loadProspectiveClientsForMonitoring", prospectsResult.reason), []);
  const leadByTenant = new Map(leadSettings.map((row) => [String(row.tenant_id), row]));
  const activityByTenant = new Map<string, string>();
  activity.forEach((row) => {
    const tenantId = String(row.tenant_id ?? "");
    if (tenantId && !activityByTenant.has(tenantId)) activityByTenant.set(tenantId, String(row.created_at ?? ""));
  });
  const tenantRows = tenants.map((tenant) => {
    const tenantId = String(tenant.tenant_id);
    const activeModules = moduleHealthRows.filter((module) => module.active_clients > 0).map((module) => module.label);
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
  const rows = [...tenantRows, ...prospects].filter((row) => {
    const requested = String(filters.status ?? "").toLowerCase();
    if (!requested) return true;
    if (requested === "past") return row.client_stage === "past";
    if (requested === "prospective") return row.client_stage === "prospective";
    if (requested === "active") return row.client_stage === "active";
    return String(row.subscription_status ?? row.status ?? "").toLowerCase() === requested;
  });
  return { rows, total: rows.length, module_health: moduleHealthRows };
}

export async function getAdminModuleHealth(filters: AdminMonitoringFilters = {}) {
  const tenants = await loadTenantsForMonitoring(filters);
  return { rows: await buildModuleHealth(tenants, filters), modules: ADMIN_MODULES };
}

export async function getAdminIntegrationHealth(filters: AdminMonitoringFilters = {}) {
  const tenants = await loadTenantsForMonitoring(filters);
  const tenantName = new Map(tenants.map((tenant) => [String(tenant.tenant_id), String(tenant.business_name ?? "Client")]));
  const scoped = { ...filters, tenantIds: filters.tenantIds };
  const [healthRows, incidents, attempts, prompts] = await Promise.all([
    loadRows("integration_health_checks", scoped, { dateColumn: "last_checked_at", limit: 1000 }),
    loadRows("integration_incidents", scoped, { dateColumn: "last_seen_at", limit: 1000 }),
    loadRows("integration_recovery_attempts", scoped, { dateColumn: "created_at", limit: 200 }),
    loadRows("client_reconnect_prompts", scoped, { dateColumn: "created_at", limit: 500 }),
  ]);
  const filteredHealth = healthRows.filter((row) => {
    if (filters.module && String(row.module ?? "") !== filters.module) return false;
    if (filters.status && String(row.status ?? "") !== filters.status && String(row.severity ?? "") !== filters.status) return false;
    return true;
  });
  const filteredIncidents = incidents.filter((row) => {
    if (filters.module && String(row.module ?? "") !== filters.module) return false;
    if (filters.status && String(row.status ?? "") !== filters.status && String(row.severity ?? "") !== filters.status) return false;
    return true;
  });
  const openIncidents = filteredIncidents.filter((row) => ["open", "investigating"].includes(String(row.status ?? "").toLowerCase()));
  const critical = openIncidents.filter((row) => row.severity === "critical").length;
  const warning = openIncidents.filter((row) => row.severity === "warning").length;
  const recovered = filteredIncidents.filter((row) => row.status === "recovered").length;
  const healthCounts = filteredHealth.reduce<Record<string, number>>((acc, row) => {
    const status = String(row.status ?? "unknown");
    acc[status] = (acc[status] ?? 0) + 1;
    return acc;
  }, {});

  return {
    stats: {
      overall_status: critical ? "critical" : warning ? "warning" : "healthy",
      active_critical_incidents: critical,
      active_warning_incidents: warning,
      recovered_incidents: recovered,
      health_checks: filteredHealth.length,
      failing_integrations: filteredHealth.filter((row) => ["failing", "misconfigured", "needs_reauth", "disconnected"].includes(String(row.status ?? ""))).length,
      degraded_integrations: filteredHealth.filter((row) => row.status === "degraded").length,
      clients_needing_reconnect: prompts.filter((row) => row.status === "active").length,
    },
    health: filteredHealth.map((row) => ({
      ...row,
      client: tenantName.get(String(row.tenant_id)) ?? (row.tenant_id ? "Client" : "Platform-wide"),
    })),
    incidents: filteredIncidents.map((row) => ({
      ...row,
      client: tenantName.get(String(row.tenant_id)) ?? (row.tenant_id ? "Client" : "Platform-wide"),
    })),
    recovery_attempts: attempts.map((row) => ({
      ...row,
      client: tenantName.get(String(row.tenant_id)) ?? (row.tenant_id ? "Client" : "Platform-wide"),
    })),
    prompts: prompts.map((row) => ({
      ...row,
      client: tenantName.get(String(row.tenant_id)) ?? "Client",
    })),
    health_counts: healthCounts,
  };
}

export async function getAdminIntegrationIncidentDetail(incidentId: string) {
  const svc = requireService();
  const { data: incident, error } = await svc.from("integration_incidents").select("*").eq("id", incidentId).maybeSingle();
  if (error) throw error;
  if (!incident) throw new Error("Incident not found");
  let healthQuery = svc
    .from("integration_health_checks")
    .select("*")
    .eq("integration", incident.integration)
    .limit(10);
  healthQuery = incident.module ? healthQuery.eq("module", incident.module) : healthQuery.is("module", null);
  const [{ data: attempts, error: attemptsErr }, { data: healthRows, error: healthErr }] = await Promise.all([
    svc.from("integration_recovery_attempts").select("*").eq("incident_id", incidentId).order("created_at", { ascending: false }),
    healthQuery,
  ]);
  if (attemptsErr) throw attemptsErr;
  if (healthErr && !isSchemaCompatibilityError(healthErr)) throw healthErr;
  let client: Record<string, unknown> | null = null;
  if (incident.tenant_id) {
    const { data } = await svc.from("tenants").select("tenant_id,business_name,status").eq("tenant_id", incident.tenant_id).maybeSingle();
    client = data ?? null;
  }
  return {
    incident,
    client,
    recovery_attempts: attempts ?? [],
    related_health_checks: healthRows ?? [],
  };
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
  const integrationFilters = { ...filters, tenantIds: filters.tenantIds };
  const [settingsRows, leads, messages, events, integrationHealth, integrationIncidents] = await Promise.all([
    loadRows("lead_recovery_settings", scoped, { dateColumn: "", limit: 10000 }),
    loadRows("leads", scoped, { limit: 10000 }),
    loadRows("lead_messages", scoped, { limit: 10000 }),
    loadRows("lead_events", scoped, { limit: 10000 }),
    loadRows("integration_health_checks", integrationFilters, { dateColumn: "last_checked_at", limit: 500 }),
    loadRows("integration_incidents", integrationFilters, { dateColumn: "last_seen_at", limit: 500 }),
  ]);
  const tenantName = new Map(tenants.map((tenant) => [String(tenant.tenant_id), String(tenant.business_name ?? "Client")]));
  const settingsByTenant = new Map(settingsRows.map((setting) => [String(setting.tenant_id), setting]));
  const missedCalls = events.filter((event) => event.event_type === "missed_call_received").length;
  const textbacks = messages.filter((message) => message.direction === "outbound" && message.channel === "sms").length;
  const customerResponses = messages.filter((message) => message.direction === "inbound" && message.channel === "sms").length;
  const qualified = leads.filter((lead) => lead.status === "qualified").length;
  const booked = leads.filter((lead) => lead.status === "booked").length;
  const lost = leads.filter((lead) => lead.status === "lost").length;
  const completed = leads.filter((lead) => lead.status === "completed").length;
  const ownerNotifications = events.filter((event) => event.event_type === "owner_notified").length;
  const needsFollowUp = leads.filter((lead) => ["new", "auto_contacted", "responded", "qualified"].includes(String(lead.status))).length;
  const noOwnerAction = leads.filter((lead) => !events.some((event) => event.lead_id === lead.id && event.event_type === "owner_notified")).length;
  const deliveryFailures = events.filter((event) => String(event.status ?? event.event_type ?? "").toLowerCase().includes("fail")).length;
  const forwardingNotConfigured = settingsRows.filter((setting) => setting.enabled === true && !leadRecoveryIsActive(setting)).length;
  const waitingForVerification = settingsRows.filter((setting) => ["waiting_for_verification", "pending"].includes(String(setting.forwarding_status ?? setting.verification_status ?? "").toLowerCase())).length;
  const verificationFailed = settingsRows.filter((setting) => ["failed", "error"].includes(String(setting.forwarding_status ?? setting.verification_status ?? "").toLowerCase())).length;
  const twilioNumberMissing = settingsRows.filter((setting) => setting.enabled === true && !setting.twilio_phone_number).length;
  const activeClients = settingsRows.filter(leadRecoveryIsActive).length;
  const enabledClients = settingsRows.filter((setting) => setting.enabled === true).length;
  const leadRecoveryHealth = integrationHealth.filter((row) => ["lead_recovery_sms", "lead_recovery_webhooks"].includes(String(row.module ?? "")) || String(row.integration ?? "").toLowerCase() === "twilio");
  const leadRecoveryIncidents = integrationIncidents.filter((row) => ["lead_recovery_sms", "lead_recovery_webhooks"].includes(String(row.module ?? "")) || String(row.integration ?? "").toLowerCase() === "twilio");
  const twilioFailures = leadRecoveryIncidents.filter((row) => ["open", "investigating"].includes(String(row.status ?? "open")) && String(row.integration ?? "").toLowerCase() === "twilio").length;
  const webhookFailures = leadRecoveryIncidents.filter((row) => ["open", "investigating"].includes(String(row.status ?? "open")) && String(row.module ?? "").includes("webhook")).length;
  const noActivityClients = settingsRows.filter((setting) => leadRecoveryIsActive(setting) && !leads.some((lead) => String(lead.tenant_id) === String(setting.tenant_id)) && !events.some((event) => String(event.tenant_id) === String(setting.tenant_id))).length;
  const totalActivity = missedCalls + textbacks + customerResponses + qualified + booked + lost + completed + ownerNotifications;
  const attentionCount = needsFollowUp + forwardingNotConfigured + waitingForVerification + verificationFailed + twilioNumberMissing + twilioFailures + webhookFailures;
  const moduleHealth =
    totalActivity === 0 && activeClients === 0
      ? "no_activity"
      : twilioFailures > 0 || webhookFailures > 0 || verificationFailed > 0 || twilioNumberMissing > 0
        ? "critical"
        : forwardingNotConfigured > 0 || waitingForVerification > 0 || needsFollowUp > 0 || noActivityClients > 0
          ? "warning"
          : activeClients > 0
            ? "healthy"
            : "no_activity";
  const healthDescription =
    moduleHealth === "critical"
      ? `${twilioFailures + webhookFailures + verificationFailed + twilioNumberMissing} critical issue${twilioFailures + webhookFailures + verificationFailed + twilioNumberMissing === 1 ? "" : "s"}`
      : moduleHealth === "warning"
        ? `${attentionCount} item${attentionCount === 1 ? "" : "s"} need attention`
        : moduleHealth === "healthy"
          ? "No open issues"
          : "No lead recovery activity yet";
  const rows = leads.map((lead) => ({
    ...lead,
    client: tenantName.get(String(lead.tenant_id)) ?? "Client",
    owner_notified: events.some((event) => event.lead_id === lead.id && event.event_type === "owner_notified"),
    booked: lead.status === "booked" || lead.status === "completed",
  }));
  return {
    summary: {
      moduleHealth,
      moduleHealthLabel: moduleHealth === "no_activity" ? "No activity yet" : String(moduleHealth).replaceAll("_", " "),
      moduleHealthDescription: healthDescription,
      activeClients,
      recoveredLeads: qualified,
      bookedLeads: booked,
      needsAttention: attentionCount,
    },
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
      needs_follow_up: needsFollowUp,
      no_owner_action: noOwnerAction,
      delivery_failures: deliveryFailures,
      forwarding_not_configured: forwardingNotConfigured,
      waiting_for_verification: waitingForVerification,
      verification_failed: verificationFailed,
      twilio_failures: twilioFailures,
      webhook_failures: webhookFailures,
      twilio_number_missing: twilioNumberMissing,
      skipped_clients: settingsRows.filter((setting) => setting.forwarding_status === "skipped").length,
      disabled_clients: settingsRows.filter((setting) => setting.enabled !== true).length,
    },
    attentionItems: buildLeadRecoveryAttentionItems({
      forwardingNotConfigured,
      waitingForVerification,
      needsFollowUp,
      noOwnerAction,
      deliveryFailures,
      twilioFailures,
      webhookFailures,
      twilioNumberMissing,
      verificationFailed,
      noActivityClients,
      enabledClients,
      activeClients,
    }),
    clientRows: buildLeadRecoveryClientRows({ tenants, settingsByTenant, leads, events, tenantName }).filter((row) => {
      if (!filters.status) return true;
      return [row.health, row.setupStatus].includes(filters.status);
    }),
    recentActivity: buildLeadRecoveryRecentActivity({ leads, messages, events, tenantName }).slice(0, 25),
    logsPreview: [...leadRecoveryIncidents, ...leadRecoveryHealth]
      .filter((row) => ["critical", "warning"].includes(String(row.severity ?? "")) || ["failing", "misconfigured", "degraded"].includes(String(row.status ?? "")))
      .slice(0, 10)
      .map((row) => ({
        id: row.id,
        severity: row.severity ?? (row.status === "failing" ? "critical" : "warning"),
        integration: row.integration ?? "twilio",
        module: row.module ?? "lead_recovery",
        message: row.message ?? row.title ?? "Lead Recovery integration issue",
        created_at: row.last_seen_at ?? row.last_checked_at ?? row.created_at,
        tenant_id: row.tenant_id ?? null,
        client: row.tenant_id ? tenantName.get(String(row.tenant_id)) ?? "Client" : "Platform-wide",
      })),
    noClientsEnabled: enabledClients === 0,
    rows,
  };
}

function buildLeadRecoveryAttentionItems(input: {
  forwardingNotConfigured: number;
  waitingForVerification: number;
  needsFollowUp: number;
  noOwnerAction: number;
  deliveryFailures: number;
  twilioFailures: number;
  webhookFailures: number;
  twilioNumberMissing: number;
  verificationFailed: number;
  noActivityClients: number;
  enabledClients: number;
  activeClients: number;
}) {
  const items: Record<string, unknown>[] = [];
  const push = (count: number, severity: string, type: string, title: string, description: string, actionType: string) => {
    if (count > 0) items.push({ id: type, severity, type, title, description, count, actionType });
  };
  push(input.twilioFailures, "critical", "twilio_failures", "Twilio delivery failures", "Lead Recovery SMS or voice operations are failing and need investigation.", "View logs");
  push(input.webhookFailures, "critical", "webhook_failures", "Webhook failures", "Twilio webhook processing is failing or rejecting requests.", "View logs");
  push(input.twilioNumberMissing, "critical", "twilio_number_missing", "Twilio number missing", "Lead Recovery is enabled for clients that do not have a Twilio number assigned.", "View clients");
  push(input.verificationFailed, "critical", "verification_failed", "Setup verification failed", "One or more clients failed forwarding verification.", "View clients");
  push(input.forwardingNotConfigured, "warning", "forwarding_not_configured", "Forwarding not configured", "Clients have Lead Recovery enabled but forwarding is not verified.", "View clients");
  push(input.waitingForVerification, "warning", "waiting_for_verification", "Verification pending", "Clients started setup but have not completed verification.", "View clients");
  push(input.needsFollowUp, "warning", "needs_follow_up", "Leads needing follow-up", "Leads are waiting for an owner decision or next step.", "View leads");
  push(input.noOwnerAction, "warning", "no_owner_action", "Owner not notified", "Some leads do not have an owner notification event recorded.", "View leads");
  push(input.deliveryFailures, "warning", "delivery_failures", "SMS delivery issues", "Some Lead Recovery SMS events failed in the selected range.", "View logs");
  push(input.noActivityClients, "info", "no_activity_after_setup", "No activity after setup", "Verified clients have no missed-call or lead activity in the selected range.", "View clients");
  if (input.enabledClients === 0) {
    items.push({
      id: "no_clients_enabled",
      severity: "info",
      type: "no_clients_enabled",
      title: "No clients have Lead Recovery active yet",
      description: "Clients will appear here after setup is enabled or verified.",
      count: 0,
      actionType: "View clients",
    });
  }
  return items;
}

function buildLeadRecoveryClientRows(input: {
  tenants: TenantRow[];
  settingsByTenant: Map<string, Record<string, unknown>>;
  leads: Record<string, unknown>[];
  events: Record<string, unknown>[];
  tenantName: Map<string, string>;
}) {
  return input.tenants.map((tenant) => {
    const tenantId = String(tenant.tenant_id ?? "");
    const setting = input.settingsByTenant.get(tenantId);
    const tenantLeads = input.leads.filter((lead) => String(lead.tenant_id) === tenantId);
    const tenantEvents = input.events.filter((event) => String(event.tenant_id) === tenantId);
    const setupStatus = leadRecoverySetupStatus(setting);
    const needsFollowUp = tenantLeads.filter((lead) => ["new", "auto_contacted", "responded", "qualified"].includes(String(lead.status))).length;
    const setupBroken = Boolean(setting?.enabled === true && (!setting.twilio_phone_number || ["failed", "error"].includes(String(setting.forwarding_status ?? setting.verification_status ?? "").toLowerCase())));
    const active = setting ? leadRecoveryIsActive(setting) : false;
    const lastActivityAt = [...tenantLeads, ...tenantEvents]
      .map((row) => String(row.last_message_at ?? row.created_at ?? ""))
      .filter(Boolean)
      .sort()
      .at(-1);
    const health = setupBroken
      ? "critical"
      : setting?.enabled === true && (!active || needsFollowUp > 0 || !lastActivityAt)
        ? "warning"
        : active
          ? "healthy"
          : "inactive";
    return {
      tenantId,
      tenant_id: tenantId,
      businessName: input.tenantName.get(tenantId) ?? String(tenant.business_name ?? "Client"),
      ownerEmail: tenant.email ?? tenant.owner_email ?? null,
      health,
      setupStatus,
      missedCalls: tenantEvents.filter((event) => event.event_type === "missed_call_received").length,
      leadsQualified: tenantLeads.filter((lead) => lead.status === "qualified").length,
      bookedLeads: tenantLeads.filter((lead) => lead.status === "booked").length,
      needsFollowUp,
      lastActivityAt: lastActivityAt ?? null,
      openIssuesCount: [setupBroken, setting?.enabled === true && !active, needsFollowUp > 0].filter(Boolean).length,
    };
  });
}

function leadRecoverySetupStatus(setting?: Record<string, unknown>) {
  if (!setting) return "disabled";
  if (setting.enabled !== true) return "disabled";
  if (!setting.twilio_phone_number) return "twilio number missing";
  const status = String(setting.forwarding_status ?? setting.verification_status ?? "not_configured").toLowerCase();
  if (["active", "verified"].includes(status)) return "verified";
  if (["waiting_for_verification", "pending"].includes(status)) return "waiting for verification";
  if (["failed", "error"].includes(status)) return "error";
  if (status === "skipped") return "disabled";
  return "forwarding not configured";
}

function buildLeadRecoveryRecentActivity(input: {
  leads: Record<string, unknown>[];
  messages: Record<string, unknown>[];
  events: Record<string, unknown>[];
  tenantName: Map<string, string>;
}) {
  const leadById = new Map(input.leads.map((lead) => [String(lead.id), lead]));
  const eventRows = input.events.map((event) => ({
    id: event.id,
    tenantId: event.tenant_id,
    tenant_id: event.tenant_id,
    businessName: input.tenantName.get(String(event.tenant_id)) ?? "Client",
    eventType: event.event_type,
    title: leadRecoveryEventTitle(String(event.event_type ?? "lead_event")),
    description: "",
    status: String(event.status ?? event.event_type ?? "event").toLowerCase().includes("fail") ? "failed" : "completed",
    createdAt: event.created_at,
    created_at: event.created_at,
    leadId: event.lead_id ?? null,
    leadLabel: safeLeadLabel(leadById.get(String(event.lead_id ?? ""))),
  }));
  const messageRows = input.messages.map((message) => ({
    id: message.id,
    tenantId: message.tenant_id,
    tenant_id: message.tenant_id,
    businessName: input.tenantName.get(String(message.tenant_id)) ?? "Client",
    eventType: message.direction === "outbound" ? "textback_sent" : "caller_replied",
    title: message.direction === "outbound" ? "Text-back sent" : "Caller replied",
    description: "",
    status: "completed",
    createdAt: message.created_at,
    created_at: message.created_at,
    leadId: message.lead_id ?? null,
    leadLabel: safeLeadLabel(leadById.get(String(message.lead_id ?? ""))),
  }));
  const leadRows = input.leads.map((lead) => ({
    id: `lead-${lead.id}`,
    tenantId: lead.tenant_id,
    tenant_id: lead.tenant_id,
    businessName: input.tenantName.get(String(lead.tenant_id)) ?? "Client",
    eventType: `lead_${lead.status ?? "created"}`,
    title: leadRecoveryLeadTitle(String(lead.status ?? "created")),
    description: String(lead.service_requested ?? ""),
    status: lead.status ?? "new",
    createdAt: lead.last_message_at ?? lead.updated_at ?? lead.created_at,
    created_at: lead.last_message_at ?? lead.updated_at ?? lead.created_at,
    leadId: lead.id,
    leadLabel: safeLeadLabel(lead),
  }));
  return [...eventRows, ...messageRows, ...leadRows].sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));
}

function leadRecoveryEventTitle(eventType: string) {
  const labels: Record<string, string> = {
    missed_call_received: "Missed call received",
    owner_notified: "Owner alerted",
    lead_recovery_verification_verified: "Setup verified",
    lead_recovery_verification_started: "Setup verification started",
    lead_recovery_verification_call_received: "Verification call received",
    lead_recovery_setup_skipped: "Setup skipped",
  };
  return labels[eventType] ?? eventType.replaceAll("_", " ");
}

function leadRecoveryLeadTitle(status: string) {
  const labels: Record<string, string> = {
    qualified: "Lead qualified",
    booked: "Lead booked",
    lost: "Lead lost",
    completed: "Lead completed",
    new: "Follow-up needed",
    auto_contacted: "Text-back intake active",
    responded: "Caller replied",
  };
  return labels[status] ?? "Lead updated";
}

function safeLeadLabel(lead?: Record<string, unknown>) {
  if (!lead) return null;
  const name = String(lead.customer_name ?? "").trim();
  if (name) return name;
  return maskPhone(String(lead.customer_phone ?? ""));
}

function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return phone ? "Masked phone" : null;
  return `•••-•••-${digits.slice(-4)}`;
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
  if (moduleId === "reviews") {
    const [gatheredReviews, reviewRequests] = await Promise.all([
      loadRows("reviews", filters, { limit: 500 }),
      loadRows("review_requests", filters, { limit: 500 }),
    ]);
    const gatheredRows: Record<string, unknown>[] = gatheredReviews.map((row) => ({
      ...row,
      record_type: "Gathered review",
      source_display: String(row.source ?? row.provider ?? row.platform ?? "Review source"),
    }));
    const requestRows: Record<string, unknown>[] = reviewRequests.map((row) => ({
      ...row,
      record_type: "Review request",
      source_display: String(row.channel ?? row.delivery_channel ?? "Request workflow"),
      title: row.customer_name ?? row.customer_email ?? row.customer_phone ?? row.id,
    }));
    const rows: Record<string, unknown>[] = [...requestRows, ...gatheredRows].sort((a, b) => {
      const aTime = Date.parse(String(a.created_at ?? a.updated_at ?? ""));
      const bTime = Date.parse(String(b.created_at ?? b.updated_at ?? ""));
      return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
    });
    return {
      stats: {
        total: rows.length,
        review_requests: reviewRequests.length,
        gathered_reviews: gatheredReviews.length,
        failed: rows.filter((row) => ["failed", "error"].includes(String(row.status ?? "").toLowerCase())).length,
        active_clients: new Set(rows.map((row) => row.tenant_id).filter(Boolean)).size,
      },
      rows,
      title: "Reviews",
    };
  }
  const tableByModule: Record<string, { table: string; dateColumn?: string; title: string }> = {
    "gbp-posting": { table: "post_history", dateColumn: "published_at", title: "GBP Posting" },
    gbp_posting: { table: "post_history", dateColumn: "published_at", title: "GBP Posting" },
    "gbp-audits": { table: "listing_audits", dateColumn: "audited_at", title: "GBP Audits" },
    gbp_audits: { table: "listing_audits", dateColumn: "audited_at", title: "GBP Audits" },
    reviews: { table: "reviews", title: "Reviews" },
    citations: { table: "client_activity_events", title: "Citations" },
    visibility: { table: "rank_snapshots", title: "Rank Tracking" },
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

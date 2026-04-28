import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createServiceClient, type SupabaseClient } from "@supabase/supabase-js";
import { normalizePostLoginResolution, type PostLoginRole } from "@/features/auth/post-login-routing";

const shouldLogAuthRouting =
  process.env.LOG_AUTH_ROUTING === "true" || process.env.NODE_ENV !== "production";

const logAuthRouting = (event: string, payload: Record<string, unknown>) => {
  if (!shouldLogAuthRouting) return;
  console.info(`[auth-routing] ${event}`, payload);
};

type OnboardingAccessState = {
  signedIn: boolean;
  eligible: boolean;
  completed: boolean;
  role: PostLoginRole | null;
  destination: string | null;
  nextStep: string | null;
  tenantId: string | null;
};

const ACTIVE_BILLING_STATUSES = new Set(["active", "trialing"]);

const ONBOARDING_STATUS_RANK: Record<string, number> = {
  in_progress: 0,
  business_setup: 1,
  stripe_pending: 2,
  stripe_started: 3,
  google_pending: 4,
  google_connected: 5,
  completed: 6,
  activated: 6,
  canceled: -1,
};

const normalizeStatus = (value: unknown): string => String(value ?? "").trim().toLowerCase();

const extractTenantIds = (rows: Array<{ tenant_id?: unknown }> | null | undefined): string[] =>
  (rows ?? [])
    .map((row) => (typeof row.tenant_id === "string" && row.tenant_id.trim() ? row.tenant_id.trim() : null))
    .filter((value): value is string => Boolean(value));

const pickTenantIdFromProfiles = (rows: Array<{ tenant_id?: string | null }> | null | undefined): string | null =>
  extractTenantIds(rows)[0] ?? null;

type CompletionChecks = {
  hasActiveBilling: boolean;
  hasConnectedGbp: boolean;
  hasBusinessInfo: boolean;
};

const hasCompletedBusinessInfo = (status: unknown, tenantBusinessName: unknown): boolean => {
  const normalized = normalizeStatus(status);
  if ((ONBOARDING_STATUS_RANK[normalized] ?? -1) >= ONBOARDING_STATUS_RANK.stripe_pending) {
    return true;
  }
  return typeof tenantBusinessName === "string" && tenantBusinessName.trim().length > 1;
};

async function verifyTenantCompletion(
  svc: SupabaseClient,
  tenantId: string,
): Promise<CompletionChecks> {
  const [
    { data: billingRows, error: billingErr },
    { data: locationRows, error: locationErr },
    { data: accountRows, error: accountErr },
    { data: pendingRows, error: pendingErr },
    { data: tenantRows, error: tenantErr },
  ] = await Promise.all([
    svc.from("billing_subscriptions").select("status").eq("tenant_id", tenantId).limit(20),
    svc
      .from("locations")
      .select("id")
      .eq("tenant_id", tenantId)
      .not("google_location_id", "is", null)
      .limit(1),
    svc.from("connected_accounts").select("id").eq("tenant_id", tenantId).limit(1),
    svc.from("pending_onboarding").select("status").eq("tenant_id", tenantId).limit(20),
    svc.from("tenants").select("business_name").eq("tenant_id", tenantId).limit(1),
  ]);
  if (billingErr) console.warn("Failed completion billing check", { tenantId, billingErr });
  if (locationErr) console.warn("Failed completion GBP location check", { tenantId, locationErr });
  if (accountErr) console.warn("Failed completion GBP account check", { tenantId, accountErr });
  if (pendingErr) console.warn("Failed completion business info check", { tenantId, pendingErr });
  if (tenantErr) console.warn("Failed completion tenant check", { tenantId, tenantErr });

  const hasActiveBilling = (billingRows ?? []).some((row) =>
    ACTIVE_BILLING_STATUSES.has(normalizeStatus(row.status)),
  );
  const hasConnectedGbp = (locationRows ?? []).length > 0 || (accountRows ?? []).length > 0;
  const tenantBusinessName = tenantRows?.[0]?.business_name;
  const hasBusinessInfo = (pendingRows ?? []).some((row) =>
    hasCompletedBusinessInfo(row.status, tenantBusinessName),
  ) || hasCompletedBusinessInfo(null, tenantBusinessName);
  return { hasActiveBilling, hasConnectedGbp, hasBusinessInfo };
}

const sortPendingRows = <T extends { status?: unknown; invited_at?: string | null }>(rows: T[]): T[] =>
  [...rows].sort((a, b) => {
    const leftTime = a.invited_at ? Date.parse(a.invited_at) : 0;
    const rightTime = b.invited_at ? Date.parse(b.invited_at) : 0;
    if (rightTime !== leftTime) return rightTime - leftTime;
    const left = ONBOARDING_STATUS_RANK[normalizeStatus(a.status)] ?? -999;
    const right = ONBOARDING_STATUS_RANK[normalizeStatus(b.status)] ?? -999;
    return right - left;
  });

const pickPreferredPendingRow = <T extends { status?: unknown; invited_at?: string | null; tenant_id?: unknown }>(
  rows: T[] | null | undefined,
  tenantHints?: Set<string>,
): T | null => {
  if (!rows?.length) return null;

  if (tenantHints && tenantHints.size > 0) {
    const tenantMatched = rows.filter(
      (row) => typeof row.tenant_id === "string" && tenantHints.has(row.tenant_id),
    );
    if (tenantMatched.length > 0) {
      return sortPendingRows(tenantMatched)[0];
    }
  }

  const unclaimedRows = rows.filter((row) => row.tenant_id === null || row.tenant_id === undefined || row.tenant_id === "");
  if (unclaimedRows.length > 0) {
    return sortPendingRows(unclaimedRows)[0];
  }

  return sortPendingRows(rows)[0];
};

export async function getOnboardingAccessState(): Promise<OnboardingAccessState> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const allowAuthOnly = process.env.NEXT_PUBLIC_ALLOW_AUTH_ONLY_ACCESS === "true";
  if (!url || !anonKey) {
    return {
      signedIn: false,
      eligible: false,
      completed: false,
      role: null,
      destination: null,
      nextStep: null,
      tenantId: null,
    };
  }

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
  } = await supabase.auth.getUser();

  if (!user?.id || !user.email) {
    return {
      signedIn: false,
      eligible: false,
      completed: false,
      role: null,
      destination: null,
      nextStep: null,
      tenantId: null,
    };
  }

  const { data: routeData, error: routeErr } = await supabase.rpc("resolve_post_login_destination");
  if (!routeErr) {
    const route = normalizePostLoginResolution(routeData);
    const eligible = route.role === "client";
    let completed = eligible && route.onboardingComplete;
    let destination = route.destination;
    let nextStep = route.nextStep;
    if (completed && serviceKey && route.tenantId) {
      const svc = createServiceClient(url, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const checks = await verifyTenantCompletion(svc, route.tenantId);
      completed = checks.hasActiveBilling && checks.hasConnectedGbp && checks.hasBusinessInfo;
      if (!completed) {
        destination = "/onboarding";
        nextStep = !checks.hasConnectedGbp
          ? "google_profile"
          : !checks.hasBusinessInfo
            ? "business_info"
            : "stripe";
      }
    }
    logAuthRouting("client_guard.rpc_resolution", {
      userId: user.id,
      email: user.email.toLowerCase(),
      role: route.role,
      destination,
      onboardingComplete: completed,
      nextStep,
      tenantId: route.tenantId,
    });
    return {
      signedIn: true,
      eligible,
      completed,
      role: route.role,
      destination,
      nextStep,
      tenantId: route.tenantId,
    };
  }
  console.warn("resolve_post_login_destination RPC failed in onboarding guard, falling back", {
    userId: user.id,
    routeErr,
  });

  if (!serviceKey) {
    if (allowAuthOnly) {
      // Explicit opt-in for local development where service-role checks are unavailable.
      return {
        signedIn: true,
        eligible: true,
        completed: true,
        role: "client",
        destination: "/dashboard",
        nextStep: "done",
        tenantId: null,
      };
    }
    // Fail closed unless auth-only mode is explicitly enabled.
    return {
      signedIn: true,
      eligible: false,
      completed: false,
      role: "invalid",
        destination: "/sign-in?error=invalid_role",
        nextStep: "google_profile",
        tenantId: null,
      };
  }

  const svc = createServiceClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const [
    { data: pendingRows, error: pendingErr },
    { data: profileRows, error: profileErr },
    { data: membershipRows, error: membershipErr },
  ] = await Promise.all([
    svc
      .from("pending_onboarding")
      .select("status, tenant_id, invited_at")
      .ilike("email", user.email.toLowerCase())
      .limit(50),
    svc.from("profiles").select("tenant_id").eq("user_id", user.id).limit(50),
    svc.from("memberships").select("tenant_id").eq("user_id", user.id).limit(50),
  ]);
  const tenantHints = new Set([
    ...extractTenantIds(profileRows ?? []),
    ...extractTenantIds(membershipRows ?? []),
  ]);
  const preferredPending = pickPreferredPendingRow(pendingRows ?? [], tenantHints);
  const preferredPendingStatus = normalizeStatus(preferredPending?.status);
  const hasActiveInvite = Boolean(preferredPending) && preferredPendingStatus !== "canceled";
  const tenantId =
    pickTenantIdFromProfiles(profileRows ?? []) ??
    pickTenantIdFromProfiles(membershipRows ?? []) ??
    preferredPending?.tenant_id ??
    null;
  if (pendingErr) {
    console.warn("Failed to load pending onboarding row for access guard", {
      userId: user.id,
      email: user.email.toLowerCase(),
      pendingErr,
    });
  }
  if (profileErr) {
    console.warn("Failed to load profile row for access guard", { userId: user.id, profileErr });
  }
  if (membershipErr) {
    console.warn("Failed to load membership row for access guard", { userId: user.id, membershipErr });
  }

  let hasActiveBilling = false;
  let hasConnectedGbp = false;
  let hasBusinessInfo = false;
  if (tenantId) {
    const checks = await verifyTenantCompletion(svc, tenantId);
    hasActiveBilling = checks.hasActiveBilling;
    hasConnectedGbp = checks.hasConnectedGbp;
    hasBusinessInfo = checks.hasBusinessInfo;
  }

  const completedFromInfra = hasActiveBilling && hasConnectedGbp && hasBusinessInfo;
  const eligible = hasActiveInvite || Boolean(tenantId);
  const completed = eligible && completedFromInfra;
  logAuthRouting("client_guard.fallback_resolution", {
    userId: user.id,
    email: user.email.toLowerCase(),
    role: eligible ? "client" : "invalid",
    destination: eligible ? (completed ? "/dashboard" : "/onboarding") : "/sign-in?error=invalid_role",
    onboardingComplete: completed,
    nextStep: completed
      ? "done"
      : !hasConnectedGbp
        ? "google_profile"
        : !hasBusinessInfo
          ? "business_info"
          : "stripe",
    tenantId,
    hasActiveBilling,
    hasConnectedGbp,
    hasBusinessInfo,
    source: "fallback_pending_onboarding",
  });
  return {
    signedIn: true,
    eligible,
    completed,
    role: eligible ? "client" : "invalid",
    destination: eligible
      ? completed
        ? "/dashboard"
        : "/onboarding"
      : "/sign-in?error=invalid_role",
    nextStep: completed
      ? "done"
      : !hasConnectedGbp
        ? "google_profile"
        : !hasBusinessInfo
          ? "business_info"
          : "stripe",
    tenantId,
  };
}

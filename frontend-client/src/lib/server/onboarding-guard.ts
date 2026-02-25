import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createServiceClient } from "@supabase/supabase-js";

type OnboardingAccessState = {
  signedIn: boolean;
  completed: boolean;
};

// Google connection is optional during onboarding; users can continue from the dashboard later.
const COMPLETED_PENDING_STATUSES = new Set(["google_pending", "google_connected", "completed", "activated"]);
const ACTIVE_BILLING_STATUSES = new Set(["active", "trialing", "past_due"]);

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
  if (!url || !anonKey) {
    return { signedIn: false, completed: false };
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
    return { signedIn: false, completed: false };
  }
  if (!serviceKey) {
    // If service role key is unavailable, only gate by auth.
    return { signedIn: true, completed: true };
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

  let tenantActive = false;
  let hasActiveBilling = false;
  if (tenantId) {
    const { data: tenantRows, error: tenantErr } = await svc
      .from("tenants")
      .select("status")
      .eq("tenant_id", tenantId)
      .limit(1);
    if (tenantErr) {
      console.warn("Failed to load tenant status for access guard", { tenantId, tenantErr });
    }
    const tenant = tenantRows?.[0];
    tenantActive = tenant?.status === "active";

    const { data: billingRows, error: billingErr } = await svc
      .from("billing_subscriptions")
      .select("status")
      .eq("tenant_id", tenantId)
      .limit(50);
    if (billingErr) {
      console.warn("Failed to load billing status for access guard", { tenantId, billingErr });
    } else {
      hasActiveBilling = (billingRows ?? []).some((row) =>
        ACTIVE_BILLING_STATUSES.has(normalizeStatus(row.status)),
      );
    }
  }

  const completedFromPending = COMPLETED_PENDING_STATUSES.has(preferredPendingStatus);
  // Active billing is enough to unlock dashboard access; GBP can be connected later.
  const completedFromInfra = tenantActive || hasActiveBilling;
  const completed = completedFromPending || completedFromInfra;
  return { signedIn: true, completed };
}

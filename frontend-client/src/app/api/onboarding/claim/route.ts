import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createServiceClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const ONBOARDING_STATUS_RANK = {
  in_progress: 0,
  business_setup: 1,
  stripe_pending: 2,
  stripe_started: 3,
  google_pending: 4,
  google_connected: 5,
  completed: 6,
  activated: 6,
  canceled: -1,
} as const;

type OnboardingStatus = keyof typeof ONBOARDING_STATUS_RANK;

const normalizeOnboardingStatus = (value: unknown): OnboardingStatus => {
  if (typeof value === "string" && value in ONBOARDING_STATUS_RANK) {
    return value as OnboardingStatus;
  }
  return "in_progress";
};

const maxOnboardingStatus = (left: unknown, right: unknown): OnboardingStatus => {
  const a = normalizeOnboardingStatus(left);
  const b = normalizeOnboardingStatus(right);
  return ONBOARDING_STATUS_RANK[a] >= ONBOARDING_STATUS_RANK[b] ? a : b;
};

const sortPendingRows = <T extends { status?: unknown; invited_at?: string | null }>(rows: T[]): T[] =>
  [...rows].sort((a, b) => {
    const aTime = a.invited_at ? Date.parse(a.invited_at) : 0;
    const bTime = b.invited_at ? Date.parse(b.invited_at) : 0;
    if (bTime !== aTime) return bTime - aTime;
    const statusDelta = ONBOARDING_STATUS_RANK[normalizeOnboardingStatus(b.status)] - ONBOARDING_STATUS_RANK[normalizeOnboardingStatus(a.status)];
    return statusDelta;
  });

const extractTenantIds = (rows: Array<{ tenant_id?: unknown }> | null | undefined): string[] =>
  (rows ?? [])
    .map((row) => (typeof row.tenant_id === "string" && row.tenant_id.trim() ? row.tenant_id.trim() : null))
    .filter((value): value is string => Boolean(value));

const pickTenantIdFromRows = (rows: Array<{ tenant_id?: unknown }> | null | undefined): string | null =>
  extractTenantIds(rows)[0] ?? null;

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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const asString = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const asBoolean = (value: unknown): boolean | null => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return null;
};

const getDraftFromPendingRow = (row: Record<string, unknown> | null): Record<string, unknown> | null => {
  if (!row) return null;
  if (isRecord(row.onboarding_draft)) return row.onboarding_draft;
  if (isRecord(row.onboarding_data)) return row.onboarding_data;
  if (isRecord(row.draft)) return row.draft;
  if (isRecord(row.metadata_json) && isRecord(row.metadata_json.onboarding_draft)) {
    return row.metadata_json.onboarding_draft;
  }
  if (isRecord(row.metadata) && isRecord(row.metadata.onboarding_draft)) {
    return row.metadata.onboarding_draft;
  }
  return null;
};

const applyPendingRowMatch = <T>(query: T, row: Record<string, unknown> | null, email: string): T => {
  const builder = query as { eq: (column: string, value: string | number) => unknown; ilike: (column: string, value: string) => unknown };
  const rawId = row?.id;
  if (typeof rawId === "string" && rawId.trim()) {
    return builder.eq("id", rawId.trim()) as T;
  }
  if (typeof rawId === "number") {
    return builder.eq("id", rawId) as T;
  }
  const tenantId = asString(row?.tenant_id);
  if (tenantId) {
    const tenantScoped = builder.eq("tenant_id", tenantId) as { ilike?: (column: string, value: string) => unknown };
    if (tenantScoped && typeof tenantScoped.ilike === "function") {
      return tenantScoped.ilike("email", email) as T;
    }
    return tenantScoped as T;
  }
  return builder.ilike("email", email) as T;
};

export async function POST(request: NextRequest) {
  if (!url || !anonKey || !serviceKey) {
    return NextResponse.json({ error: "Supabase keys not configured" }, { status: 500 });
  }

  const user = await resolveRequestUser(request);
  if (!user?.email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const svc = createServiceClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const normalizedEmail = user.email.trim().toLowerCase();
  const expectedInviteEmail = await readExpectedInviteEmail(request);
  if (expectedInviteEmail && expectedInviteEmail !== normalizedEmail) {
    return NextResponse.json(
      { error: `Invite email mismatch. Signed in as ${normalizedEmail}, invite is for ${expectedInviteEmail}.` },
      { status: 409 },
    );
  }

  const [
    { data: pendingRows, error: pendingErr },
    { data: profileRows, error: profileLookupErr },
    { data: membershipRows, error: membershipLookupErr },
  ] = await Promise.all([
    svc
      .from("pending_onboarding")
      .select("*")
      .ilike("email", normalizedEmail)
      .limit(50),
    svc
      .from("profiles")
      .select("tenant_id")
      .eq("user_id", user.id)
      .limit(50),
    svc
      .from("memberships")
      .select("tenant_id")
      .eq("user_id", user.id)
      .limit(50),
  ]);

  if (pendingErr) {
    return NextResponse.json({ error: pendingErr.message }, { status: 400 });
  }
  if (profileLookupErr) {
    console.warn("Unable to inspect profile rows during onboarding claim", {
      userId: user.id,
      email: normalizedEmail,
      profileLookupErr,
    });
  }
  if (membershipLookupErr) {
    console.warn("Unable to inspect membership rows during onboarding claim", {
      userId: user.id,
      email: normalizedEmail,
      membershipLookupErr,
    });
  }

  const tenantHints = new Set([
    ...extractTenantIds(profileRows),
    ...extractTenantIds(membershipRows),
  ]);
  const pending = pickPreferredPendingRow(pendingRows, tenantHints);

  if (!pending) {
    const exempt = await isStaffUser(svc, user.id);
    if (exempt) {
      return NextResponse.json({ status: "admin_exempt", email: normalizedEmail }, { status: 200 });
    }

    // If user already has a tenant profile, recover onboarding status from tenant/billing state
    // instead of creating a brand-new in-progress row.
    const profileTenantId = pickTenantIdFromRows(profileRows) ?? pickTenantIdFromRows(membershipRows);
    if (profileTenantId) {
      const { data: tenantRows, error: tenantLookupErr } = await svc
        .from("tenants")
        .select("business_name, plan_name, plan_tier, location_limit, status")
        .eq("tenant_id", profileTenantId)
        .limit(1);
      const tenant = tenantRows?.[0] ?? null;
      if (tenantLookupErr) {
        console.warn("Unable to inspect tenant for missing pending onboarding row", {
          userId: user.id,
          email: normalizedEmail,
          profileTenantId,
          tenantLookupErr,
        });
      }

      const recoveredStatus = await inferEffectiveOnboardingStatus(
        svc,
        profileTenantId,
        tenant?.status === "active" ? "completed" : "in_progress",
      );

      // Best effort: recreate pending row for consistency, but never block the response.
      const recoveredPending = {
        email: normalizedEmail,
        business_name: tenant?.business_name ?? "",
        first_name: "",
        last_name: "",
        plan: tenant?.plan_name ?? tenant?.plan_tier ?? "starter",
        location_limit: tenant?.location_limit ?? 1,
        status: recoveredStatus,
        invited_at: new Date().toISOString(),
        invited_by_admin_user_id: null,
        tenant_id: profileTenantId,
      };
      const { error: recoveredInsertErr } = await svc.from("pending_onboarding").insert(recoveredPending);
      if (recoveredInsertErr) {
        console.warn("Unable to recreate pending onboarding row from existing tenant profile", {
          userId: user.id,
          email: normalizedEmail,
          profileTenantId,
          recoveredInsertErr,
        });
      }

      return NextResponse.json({
        tenant_id: profileTenantId,
        business_name: recoveredPending.business_name,
        first_name: "",
        last_name: "",
        plan_name: recoveredPending.plan,
        location_limit: recoveredPending.location_limit,
        status: recoveredStatus,
        onboarding_draft: null,
        agreement_signature: null,
        agreement_accepted: false,
        agreement_signed_at: null,
        password_set_at: null,
      });
    }

    // If no pending row exists, create a minimal one so the user can proceed.
    const skeleton = {
      email: normalizedEmail,
      business_name: "",
      first_name: "",
      last_name: "",
      plan: "starter",
      location_limit: 1,
      status: "in_progress",
      invited_at: new Date().toISOString(),
      invited_by_admin_user_id: null,
      tenant_id: null,
    };
    const { error: createPendingErr, data: created } = await svc.from("pending_onboarding").insert(skeleton).select().maybeSingle();
    if (createPendingErr) {
      // Fallback: allow onboarding to continue even without a pending record.
      return NextResponse.json({ status: "no_pending" }, { status: 200 });
    }
    return NextResponse.json({
      tenant_id: created?.tenant_id,
      business_name: created?.business_name,
      first_name: created?.first_name,
      last_name: created?.last_name,
      plan_name: created?.plan,
      location_limit: created?.location_limit,
      status: created?.status ?? "in_progress",
      onboarding_draft: null,
      agreement_signature: null,
      agreement_accepted: false,
      agreement_signed_at: null,
      password_set_at: null,
    });
  }

  if (pending.status === "canceled") {
    return NextResponse.json({ error: "Invite canceled" }, { status: 410 });
  }

  // Create tenant if it doesn't exist
  const tenantId = pending.tenant_id ?? crypto.randomUUID();
  if (!pending.tenant_id) {
    const businessName = pending.business_name ?? "";
    const slug =
      businessName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || tenantId;
    const { error: tenantErr } = await svc.from("tenants").insert({
      tenant_id: tenantId,
      business_name: businessName,
      slug,
      // Keep new tenants non-active until billing/GBP are completed
      status: "invited",
      plan_name: pending.plan ?? "starter",
      plan_tier: pending.plan ?? "starter",
      location_limit: pending.location_limit ?? 1,
    });
    if (tenantErr) {
      return NextResponse.json({ error: tenantErr.message }, { status: 400 });
    }
  }

  // Upsert profile for this user
  const { error: profileErr } = await svc
    .from("profiles")
    .upsert({
      user_id: user.id,
      email: normalizedEmail,
      tenant_id: tenantId,
      role: "owner",
    });
  if (profileErr) {
    return NextResponse.json({ error: profileErr.message }, { status: 400 });
  }

  // Auto-detect paid status from billing + tenant state so stale pending rows don't force re-payment.
  const effectiveStatus = await inferEffectiveOnboardingStatus(
    svc,
    tenantId,
    pending.status ?? "in_progress",
  );

  let responsePending = pending;
  if (!pending.tenant_id || effectiveStatus !== pending.status) {
    const updates: Record<string, unknown> = {};
    if (!pending.tenant_id) {
      updates.tenant_id = tenantId;
    }
    if (effectiveStatus !== pending.status) {
      updates.status = effectiveStatus;
    }
    const responsePendingRecord = (responsePending ?? null) as Record<string, unknown> | null;
    let updateQuery = svc
      .from("pending_onboarding")
      .update(updates);
    updateQuery = applyPendingRowMatch(updateQuery, responsePendingRecord, normalizedEmail);
    const { data: updatedRows, error: updateErr } = await updateQuery.select("*").limit(50);
    if (updateErr) {
      console.warn("Unable to persist inferred onboarding status", {
        email: normalizedEmail,
        tenantId,
        effectiveStatus,
        updateErr,
      });
    } else {
      const preferred = pickPreferredPendingRow(updatedRows, tenantHints);
      if (preferred) {
        responsePending = preferred;
      }
    }
  }

  const responsePendingRecord = (responsePending ?? null) as Record<string, unknown> | null;
  return NextResponse.json({
    tenant_id: tenantId,
    business_name: responsePending.business_name,
    first_name: responsePending.first_name,
    last_name: responsePending.last_name,
    plan_name: responsePending.plan,
    location_limit: responsePending.location_limit,
    status: effectiveStatus,
    onboarding_draft: getDraftFromPendingRow(responsePendingRecord),
    agreement_signature: asString(responsePendingRecord?.agreement_signature),
    agreement_accepted: asBoolean(responsePendingRecord?.agreement_accepted) ?? false,
    agreement_signed_at: asString(responsePendingRecord?.agreement_signed_at),
    password_set_at: asString(responsePendingRecord?.password_set_at),
  });
}

async function readExpectedInviteEmail(request: NextRequest): Promise<string | null> {
  try {
    const body = (await request.json()) as { expected_email?: unknown };
    const value = body?.expected_email;
    if (typeof value === "string" && value.trim()) {
      return value.trim().toLowerCase();
    }
  } catch {
    // request body is optional for this endpoint
  }
  return null;
}

async function resolveRequestUser(request: NextRequest): Promise<{ id: string; email: string } | null> {
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();

  if (bearerToken) {
    const tokenClient = createServiceClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const {
      data: { user },
      error,
    } = await tokenClient.auth.getUser(bearerToken);
    if (!error && user?.id && user.email) {
      return { id: user.id, email: user.email };
    }
  }

  // Fallback to cookie-based SSR auth if no bearer token was provided.
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
  if (error || !user?.id || !user.email) {
    return null;
  }
  return { id: user.id, email: user.email };
}

async function isStaffUser(svc: SupabaseClient, userId: string): Promise<boolean> {
  // `users.is_staff` is the canonical platform-admin/staff signal.
  // `profiles.role` is tenant-scoped and can legitimately be "admin" for non-staff users.
  const { data: staffUser, error: staffErr } = await svc.from("users").select("is_staff").eq("id", userId).maybeSingle();
  if (staffErr) {
    console.warn("Unable to evaluate onboarding staff exemption", { userId, staffErr });
    return false;
  }
  return staffUser?.is_staff === true;
}

async function inferEffectiveOnboardingStatus(
  svc: SupabaseClient,
  tenantId: string,
  pendingStatus: unknown,
): Promise<OnboardingStatus> {
  let effective = normalizeOnboardingStatus(pendingStatus);
  let hasActiveBilling = false;
  let hasConnectedGbp = false;

  const { data: tenantRows, error: tenantErr } = await svc
    .from("tenants")
    .select("status")
    .eq("tenant_id", tenantId)
    .limit(1);
  const tenant = tenantRows?.[0] ?? null;
  if (tenantErr) {
    console.warn("Unable to read tenant status for onboarding claim", { tenantId, tenantErr });
  } else if (tenant?.status === "active") {
    hasActiveBilling = true;
    effective = maxOnboardingStatus(effective, "stripe_started");
  }

  const { data: subscriptionRows, error: subErr } = await svc
    .from("billing_subscriptions")
    .select("status")
    .eq("tenant_id", tenantId)
    .limit(1);
  const subscription = subscriptionRows?.[0] ?? null;
  if (subErr) {
    console.warn("Unable to read billing subscription for onboarding claim", { tenantId, subErr });
  } else {
    const billingStatus = String(subscription?.status ?? "").toLowerCase();
    if (["active", "trialing", "past_due"].includes(billingStatus)) {
      hasActiveBilling = true;
      effective = maxOnboardingStatus(effective, "google_pending");
    }
  }

  const { data: gbpRows, error: gbpErr } = await svc
    .from("gbp_connections")
    .select("status")
    .eq("tenant_id", tenantId)
    .limit(50);
  if (gbpErr) {
    console.warn("Unable to read GBP connection status for onboarding claim", { tenantId, gbpErr });
  } else {
    hasConnectedGbp = (gbpRows ?? []).some((row) => String(row.status ?? "").toLowerCase() === "connected");
    if (hasConnectedGbp) {
      effective = maxOnboardingStatus(effective, "google_connected");
    }
  }

  if (hasActiveBilling && hasConnectedGbp) {
    effective = maxOnboardingStatus(effective, "completed");
  }

  return effective;
}

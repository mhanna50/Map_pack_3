import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createServiceClient, type SupabaseClient } from "@supabase/supabase-js";
import { ensureOnboardingTenantRows } from "@/features/onboarding/server/onboarding-compat";

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
const MAX_ONBOARDING_STEP_INDEX = 2;
const ONBOARDING_STEP_LABELS = ["google_profile", "business_info", "stripe"] as const;

const describeOnboardingStep = (step: number | null): string => {
  if (step === null) return "unknown";
  return ONBOARDING_STEP_LABELS[step] ?? `step_${step}`;
};

const normalizeOnboardingStatus = (value: unknown): OnboardingStatus => {
  if (typeof value === "string" && value in ONBOARDING_STATUS_RANK) {
    return value as OnboardingStatus;
  }
  return "in_progress";
};

const mergeOnboardingStatus = (existing: unknown, requested: unknown): OnboardingStatus => {
  const existingStatus = normalizeOnboardingStatus(existing);
  if (existingStatus === "canceled") {
    return "canceled";
  }
  const requestedStatus = normalizeOnboardingStatus(requested);
  return ONBOARDING_STATUS_RANK[requestedStatus] > ONBOARDING_STATUS_RANK[existingStatus]
    ? requestedStatus
    : existingStatus;
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

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

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

const statusToResumeStep = (status: unknown): number => {
  const normalized = normalizeOnboardingStatus(status);
  switch (normalized) {
    case "business_setup":
      return 1;
    case "stripe_started":
    case "stripe_pending":
    case "google_pending":
    case "google_connected":
    case "completed":
    case "activated":
      return 2;
    default:
      return 0;
  }
};

const deriveResumeStepFromPendingRow = (
  row: Record<string, unknown> | null,
  statusOverride?: unknown,
): number => {
  const status = statusOverride ?? row?.status ?? "in_progress";
  return statusToResumeStep(status);
};

const normalizeStepIndex = (value: unknown): number | null => {
  const numeric = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim()
      ? Number(value.trim())
      : Number.NaN;
  if (!Number.isInteger(numeric)) return null;
  if (numeric < 0 || numeric > MAX_ONBOARDING_STEP_INDEX) return null;
  return numeric;
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

async function detectPendingColumns(
  svc: SupabaseClient,
  existing: Record<string, unknown> | null,
): Promise<Set<string>> {
  if (existing) {
    return new Set(Object.keys(existing));
  }
  const { data: sampleRows } = await svc.from("pending_onboarding").select("*").limit(1);
  const sample = (sampleRows?.[0] ?? null) as Record<string, unknown> | null;
  return sample ? new Set(Object.keys(sample)) : new Set<string>();
}

const applyDraftToPendingUpdate = (
  target: Record<string, unknown>,
  existing: Record<string, unknown> | null,
  columns: Set<string>,
  draft: Record<string, unknown>,
) => {
  if (columns.has("onboarding_draft")) {
    target.onboarding_draft = draft;
  }
  if (columns.has("onboarding_data")) {
    target.onboarding_data = draft;
  }
  if (columns.has("draft")) {
    target.draft = draft;
  }
  if (columns.has("metadata_json")) {
    const metadata = isRecord(existing?.metadata_json) ? { ...existing.metadata_json } : {};
    metadata.onboarding_draft = draft;
    target.metadata_json = metadata;
  }
  if (columns.has("metadata")) {
    const metadata = isRecord(existing?.metadata) ? { ...existing.metadata } : {};
    metadata.onboarding_draft = draft;
    target.metadata = metadata;
  }
};

type OptionalPendingFieldPayload = {
  draft: Record<string, unknown> | null;
  agreementSignature: string | null;
  agreementAccepted: boolean | null;
  agreementSignedAt: string | null;
  passwordSetAt: string | null;
  passwordSet: boolean | null;
};

const buildOptionalPendingFields = (
  columns: Set<string>,
  existing: Record<string, unknown> | null,
  payload: OptionalPendingFieldPayload,
): Record<string, unknown> => {
  const update: Record<string, unknown> = {};

  if (payload.draft) {
    applyDraftToPendingUpdate(update, existing, columns, payload.draft);
  }
  if (columns.has("agreement_signature")) {
    update.agreement_signature = payload.agreementSignature ?? asString(existing?.agreement_signature);
  }
  if (columns.has("agreement_accepted")) {
    update.agreement_accepted = payload.agreementAccepted ?? asBoolean(existing?.agreement_accepted) ?? false;
  }
  if (columns.has("agreement_signed_at")) {
    const priorSignedAt = asString(existing?.agreement_signed_at);
    const signedNow = (payload.agreementAccepted ?? asBoolean(existing?.agreement_accepted)) === true
      && Boolean(payload.agreementSignature ?? asString(existing?.agreement_signature));
    update.agreement_signed_at = payload.agreementSignedAt ?? (signedNow ? priorSignedAt ?? new Date().toISOString() : priorSignedAt);
  }
  if (columns.has("password_set_at")) {
    const priorPasswordSetAt = asString(existing?.password_set_at);
    update.password_set_at = payload.passwordSetAt ?? (payload.passwordSet ? priorPasswordSetAt ?? new Date().toISOString() : priorPasswordSetAt);
  }

  return update;
};

export async function POST(request: NextRequest) {
  if (!url || !anonKey || !serviceKey) {
    return NextResponse.json({ error: "Supabase keys not configured" }, { status: 500 });
  }

  const user = await resolveRequestUser(request);
  if (!user?.email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Basic rate limit: 20 requests per minute per user (very lightweight, in-memory)
  const key = `onboarding-save-${user.id}`;
  const now = Date.now();
  const windowMs = 60_000;
  const limit = 20;
  // @ts-expect-error attach to globalThis for simplicity
  const store = (globalThis.__onboardingRate__ = globalThis.__onboardingRate__ || new Map());
  const bucket = store.get(key) || [];
  const recent = bucket.filter((t: number) => now - t < windowMs);
  recent.push(now);
  store.set(key, recent);
  if (recent.length > limit) {
    console.warn("[onboarding/save] rate_limited", {
      userId: user.id,
      email: user.email,
      recentCount: recent.length,
    });
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const body = (await request.json()) as Record<string, unknown>;
  const svc = createServiceClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const email = user.email.trim().toLowerCase();
  const clientStep = normalizeStepIndex(body.client_step);
  const clientStepLabel = describeOnboardingStep(clientStep);
  const requestedStatus = body.status ?? "in_progress";
  const requestedTenantId = asString(body.tenant_id);
  console.info("[onboarding/save] request", {
    userId: user.id,
    email,
    step: clientStepLabel,
    clientStep,
    requestedStatus,
    tenantId: requestedTenantId,
  });

  const expectedInviteEmail =
    typeof body.expected_email === "string" && body.expected_email.trim()
      ? body.expected_email.trim().toLowerCase()
      : null;
  if (expectedInviteEmail && expectedInviteEmail !== email) {
    console.warn("[onboarding/save] invite_email_mismatch", {
      userId: user.id,
      signedInEmail: email,
      inviteEmail: expectedInviteEmail,
      step: clientStepLabel,
    });
    return NextResponse.json(
      {
        error: `Invite email mismatch. Signed in as ${email}, invite is for ${expectedInviteEmail}.`,
        code: "invite_email_mismatch",
        signed_in_email: email,
        invite_email: expectedInviteEmail,
      },
      { status: 409 },
    );
  }

  const [
    { data: existingRows, error: fetchErr },
    { data: profileRows, error: profileErr },
    { data: membershipRows, error: membershipErr },
  ] = await Promise.all([
    svc
      .from("pending_onboarding")
      .select("*")
      .ilike("email", email)
      .limit(50),
    svc
      .from("profiles")
      .select("tenant_id, role")
      .eq("user_id", user.id)
      .limit(50),
    svc
      .from("memberships")
      .select("tenant_id")
      .eq("user_id", user.id)
      .limit(50),
  ]);
  if (fetchErr) {
    console.warn("[onboarding/save] pending_lookup_failed", {
      userId: user.id,
      email,
      step: clientStepLabel,
      error: fetchErr.message,
    });
    return NextResponse.json({ error: fetchErr.message }, { status: 400 });
  }
  if (profileErr) {
    console.warn("Unable to load existing profile during onboarding save", {
      userId: user.id,
      email,
      profileErr,
    });
  }
  if (membershipErr) {
    console.warn("Unable to load membership during onboarding save", {
      userId: user.id,
      email,
      membershipErr,
    });
  }
  const tenantHints = new Set([
    ...extractTenantIds(profileRows),
    ...extractTenantIds(membershipRows),
  ]);
  const existing = pickPreferredPendingRow(existingRows, tenantHints);
  const existingRecord = (existing ?? null) as Record<string, unknown> | null;
  const existingTenantId = asString(existingRecord?.tenant_id);
  const profileTenantIds = extractTenantIds(profileRows);
  const membershipTenantIds = extractTenantIds(membershipRows);
  const knownTenantIds = new Set([
    ...profileTenantIds,
    ...membershipTenantIds,
    ...(existingTenantId ? [existingTenantId] : []),
  ]);
  if (!existing) {
    const exempt = await isStaffUser(svc, user.id);
    if (exempt) {
      console.warn("[onboarding/save] blocked_staff_account", {
        userId: user.id,
        email,
        step: clientStepLabel,
      });
      return NextResponse.json(
        {
          error: `Staff account (${email}) cannot create onboarding records. Sign in with the invited client account.`,
        },
        { status: 403 },
      );
    }
    console.warn("[onboarding/save] invite_required", {
      userId: user.id,
      email,
      step: clientStepLabel,
    });
    return NextResponse.json(
      {
        error: "Invite required. Ask an admin to send you an onboarding invite link.",
        code: "invite_required",
      },
      { status: 403 },
    );
  }

  if (normalizeOnboardingStatus(existing.status) === "canceled") {
    console.warn("[onboarding/save] invite_canceled", {
      userId: user.id,
      email,
      step: clientStepLabel,
    });
    return NextResponse.json(
      {
        error: "Invite canceled. Ask an admin for a new onboarding link.",
        code: "invite_canceled",
      },
      { status: 410 },
    );
  }

  const pendingColumns = await detectPendingColumns(svc, existingRecord);
  const requestedStatusWithFallback = body.status ?? existingRecord?.status ?? "in_progress";
  const mergedStatus = mergeOnboardingStatus(existingRecord?.status, requestedStatus);
  const resumeStepBeforeSave = deriveResumeStepFromPendingRow(existingRecord, existingRecord?.status);
  if (body.client_step !== undefined && clientStep === null) {
    console.warn("[onboarding/save] invalid_client_step", {
      userId: user.id,
      email,
      rawClientStep: body.client_step,
      currentResumeStep: resumeStepBeforeSave,
    });
    return NextResponse.json(
        { error: "Invalid client_step. Expected an integer from 0 to 2." },
      { status: 400 },
    );
  }
  if (clientStep !== null) {
    if (clientStep < resumeStepBeforeSave) {
      console.warn("[onboarding/save] step_already_completed", {
        userId: user.id,
        email,
        step: clientStepLabel,
        requestedStep: clientStep,
        resumeStep: resumeStepBeforeSave,
      });
      return NextResponse.json(
        {
          error: `Step already completed for this account. Continue from step ${resumeStepBeforeSave + 1}.`,
          code: "step_already_completed",
          resume_step: resumeStepBeforeSave,
        },
        { status: 409 },
      );
    }
    if (clientStep > resumeStepBeforeSave) {
      console.warn("[onboarding/save] step_out_of_sequence", {
        userId: user.id,
        email,
        step: clientStepLabel,
        requestedStep: clientStep,
        resumeStep: resumeStepBeforeSave,
      });
      return NextResponse.json(
        {
          error: `Step out of sequence. Complete step ${resumeStepBeforeSave + 1} first.`,
          code: "step_out_of_sequence",
          resume_step: resumeStepBeforeSave,
        },
        { status: 409 },
      );
    }
  }
  const tenantIdFromPayload = typeof body.tenant_id === "string" && body.tenant_id.trim() ? body.tenant_id.trim() : null;
  if (tenantIdFromPayload) {
    if (existingTenantId && tenantIdFromPayload !== existingTenantId) {
      console.warn("[onboarding/save] tenant_identity_mismatch_existing", {
        userId: user.id,
        email,
        step: clientStepLabel,
        existingTenantId,
        tenantIdFromPayload,
      });
      return NextResponse.json(
        {
          error: `Tenant mismatch. This onboarding is linked to ${existingTenantId}, not ${tenantIdFromPayload}.`,
          code: "tenant_identity_mismatch",
        },
        { status: 409 },
      );
    }
    if (knownTenantIds.size > 0 && !knownTenantIds.has(tenantIdFromPayload)) {
      console.warn("[onboarding/save] tenant_identity_mismatch_session", {
        userId: user.id,
        email,
        step: clientStepLabel,
        tenantIdFromPayload,
        knownTenantIds: Array.from(knownTenantIds),
      });
      return NextResponse.json(
        {
          error: "Tenant mismatch for this user session. Refresh onboarding and try again.",
          code: "tenant_identity_mismatch",
        },
        { status: 409 },
      );
    }
  }
  const passwordSetAt = asString(body.password_set_at);
  const passwordSet = asBoolean(body.password_set);
  const requestedResumeStep = statusToResumeStep(mergedStatus);
  const maxAllowedResumeStep = Math.min(MAX_ONBOARDING_STEP_INDEX, resumeStepBeforeSave + 1);
  if (requestedResumeStep > maxAllowedResumeStep) {
    console.warn("[onboarding/save] step_out_of_sequence_status", {
      userId: user.id,
      email,
      step: clientStepLabel,
      requestedStatus: requestedStatusWithFallback,
      requestedResumeStep,
      resumeStep: resumeStepBeforeSave,
    });
    return NextResponse.json(
      {
        error: `Step out of sequence. Complete step ${resumeStepBeforeSave + 1} first.`,
        code: "step_out_of_sequence",
        resume_step: resumeStepBeforeSave,
      },
      { status: 409 },
    );
  }
  const merged: Record<string, unknown> = {
    email,
    business_name: body.business_name ?? existingRecord?.business_name ?? "",
    first_name: body.first_name ?? existingRecord?.first_name ?? "",
    last_name: body.last_name ?? existingRecord?.last_name ?? "",
    plan: existingRecord?.plan ?? body.plan ?? "starter",
    location_limit: existingRecord?.location_limit ?? body.location_limit ?? 1,
    status: mergedStatus,
    invited_at: existingRecord?.invited_at ?? new Date().toISOString(),
    invited_by_admin_user_id: existingRecord?.invited_by_admin_user_id ?? null,
    tenant_id: existingRecord?.tenant_id ?? tenantIdFromPayload,
  };

  const incomingDraft = isRecord(body.onboarding_draft) ? body.onboarding_draft : null;
  const existingDraft = getDraftFromPendingRow(existingRecord);
  const mergedDraft = incomingDraft ?? existingDraft;
  const agreementSignature = asString(body.agreement_signature);
  const agreementAccepted = asBoolean(body.agreement_accepted);
  const agreementSignedAt = asString(body.agreement_signed_at);
  Object.assign(
    merged,
    buildOptionalPendingFields(pendingColumns, existingRecord, {
      draft: mergedDraft,
      agreementSignature,
      agreementAccepted,
      agreementSignedAt,
      passwordSetAt,
      passwordSet,
    }),
  );

  let saved: Record<string, unknown> | null = null;
  let upsertErr: { message: string } | null = null;
  if (existing) {
    let updateQuery = svc
      .from("pending_onboarding")
      .update(merged);
    updateQuery = applyPendingRowMatch(updateQuery, existingRecord, email);
    const { data: updatedRows, error: updateErr } = await updateQuery.select("*").limit(50);
    saved = pickPreferredPendingRow(updatedRows, tenantHints);
    upsertErr = updateErr ? { message: updateErr.message } : null;
  } else {
    const { data: insertedRows, error: insertErr } = await svc
      .from("pending_onboarding")
      .insert(merged)
      .select("*")
      .limit(50);
    saved = pickPreferredPendingRow(insertedRows, tenantHints);
    upsertErr = insertErr ? { message: insertErr.message } : null;

    // When the table is brand-new and empty, column detection can be inconclusive on first write.
    // Reapply optional fields using discovered columns from the inserted row.
    const insertedRecord = (saved ?? null) as Record<string, unknown> | null;
    if (!upsertErr && insertedRecord && pendingColumns.size === 0) {
      const discoveredColumns = new Set(Object.keys(insertedRecord));
      const followUpUpdate = buildOptionalPendingFields(discoveredColumns, insertedRecord, {
        draft: mergedDraft,
        agreementSignature,
        agreementAccepted,
        agreementSignedAt,
        passwordSetAt,
        passwordSet,
      });
      if (Object.keys(followUpUpdate).length > 0) {
        let refreshQuery = svc
          .from("pending_onboarding")
          .update(followUpUpdate);
        refreshQuery = applyPendingRowMatch(refreshQuery, insertedRecord, email);
        const { data: refreshedRows, error: refreshErr } = await refreshQuery.select("*").limit(50);
        if (refreshErr) {
          console.warn("Unable to persist optional onboarding fields after initial pending row insert", {
            email,
            refreshErr,
          });
        } else {
          saved = pickPreferredPendingRow(refreshedRows, tenantHints) ?? saved;
        }
      }
    }
  }

  if (upsertErr) {
    console.warn("[onboarding/save] pending_upsert_failed", {
      userId: user.id,
      email,
      step: clientStepLabel,
      error: upsertErr.message,
    });
    return NextResponse.json({ error: upsertErr.message }, { status: 400 });
  }

  const profileTenantId = pickTenantIdFromRows(profileRows);
  const profileRole =
    (profileRows ?? [])
      .map((row) => row.role)
      .find((value): value is string => typeof value === "string" && value.length > 0) ?? null;
  let resolvedTenantId = (saved?.tenant_id ?? merged.tenant_id ?? profileTenantId) as string | null;

  if (!resolvedTenantId) {
    resolvedTenantId = pickTenantIdFromRows(membershipRows);
  }

  if (resolvedTenantId) {
    const businessName = String(merged.business_name ?? "").trim();
    const plan = String(merged.plan ?? "starter").trim() || "starter";
    const locationLimitRaw = Number(merged.location_limit ?? 1);
    const locationLimit = Number.isFinite(locationLimitRaw) && locationLimitRaw > 0 ? locationLimitRaw : 1;

    const { data: tenantRows, error: tenantLookupErr } = await svc
      .from("tenants")
      .select("tenant_id, slug, status")
      .eq("tenant_id", resolvedTenantId)
      .limit(1);
    if (tenantLookupErr) {
      return NextResponse.json({ error: tenantLookupErr.message }, { status: 400 });
    }
    const existingTenant = tenantRows?.[0] ?? null;

    if (existingTenant) {
      const tenantUpdate: Record<string, unknown> = {
        plan_name: plan,
        plan_tier: plan,
        location_limit: locationLimit,
      };
      if (businessName) {
        tenantUpdate.business_name = businessName;
      }
      const { error: tenantUpdateErr } = await svc
        .from("tenants")
        .update(tenantUpdate)
        .eq("tenant_id", resolvedTenantId);
      if (tenantUpdateErr) {
        return NextResponse.json({ error: tenantUpdateErr.message }, { status: 400 });
      }
    } else {
      const slugBase = slugify(businessName) || `tenant-${resolvedTenantId.slice(0, 8)}`;
      const { error: tenantInsertErr } = await svc.from("tenants").insert({
        tenant_id: resolvedTenantId,
        business_name: businessName || "New client",
        slug: slugBase,
        status: "invited",
        plan_name: plan,
        plan_tier: plan,
        location_limit: locationLimit,
      });
      if (tenantInsertErr) {
        return NextResponse.json({ error: tenantInsertErr.message }, { status: 400 });
      }
    }

    const { error: upsertProfileErr } = await svc
      .from("profiles")
      .upsert(
        {
          user_id: user.id,
          email,
          tenant_id: resolvedTenantId,
          role: profileRole ?? "owner",
        },
        { onConflict: "user_id" },
      );
    if (upsertProfileErr) {
      return NextResponse.json({ error: upsertProfileErr.message }, { status: 400 });
    }

    const compatibilityErr = await ensureOnboardingTenantRows(svc, {
      userId: user.id,
      email,
      tenantId: resolvedTenantId,
      businessName: businessName || "New client",
      plan,
    });
    if (compatibilityErr) {
      return NextResponse.json({ error: compatibilityErr }, { status: 400 });
    }

    if (!saved?.tenant_id || saved.tenant_id !== resolvedTenantId) {
      let pendingTenantQuery = svc
        .from("pending_onboarding")
        .update({ tenant_id: resolvedTenantId });
      pendingTenantQuery = applyPendingRowMatch(
        pendingTenantQuery,
        (saved ?? existingRecord) as Record<string, unknown> | null,
        email,
      );
      const { error: pendingTenantErr } = await pendingTenantQuery;
      if (pendingTenantErr) {
        return NextResponse.json({ error: pendingTenantErr.message }, { status: 400 });
      }
    }
  }

  const savedRecord = (saved ?? merged) as Record<string, unknown>;
  const persistedStatus = normalizeOnboardingStatus(savedRecord.status);
  const resumeStep = deriveResumeStepFromPendingRow(savedRecord, persistedStatus);
  console.info("[onboarding/save] success", {
    userId: user.id,
    email,
    step: clientStepLabel,
    clientStep,
    persistedStatus,
    resumeStep,
    resumeStepLabel: describeOnboardingStep(resumeStep),
    tenantId: resolvedTenantId ?? asString(savedRecord.tenant_id),
  });
  return NextResponse.json({
    saved: true,
    status: persistedStatus,
    resume_step: resumeStep,
    pending: saved ?? merged,
  });
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

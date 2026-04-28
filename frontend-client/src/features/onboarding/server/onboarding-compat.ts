import type { SupabaseClient } from "@supabase/supabase-js";

type EnsureOnboardingTenantRowsInput = {
  userId: string;
  email: string;
  tenantId: string;
  businessName?: string | null;
  plan?: string | null;
};

const normalizeBusinessName = (value: string | null | undefined): string => {
  const normalized = value?.trim();
  return normalized || "New client";
};

const normalizePlan = (value: string | null | undefined): string => {
  const normalized = value?.trim();
  return normalized || "starter";
};

export async function ensureOnboardingTenantRows(
  svc: SupabaseClient,
  input: EnsureOnboardingTenantRowsInput,
): Promise<string | null> {
  const businessName = normalizeBusinessName(input.businessName);
  const plan = normalizePlan(input.plan);

  const { data: existingUsers, error: userLookupErr } = await svc
    .from("users")
    .select("id")
    .eq("id", input.userId)
    .limit(1);
  if (userLookupErr) {
    return userLookupErr.message;
  }

  if (!existingUsers?.length) {
    const { error: userErr } = await svc
      .from("users")
      .insert({
        id: input.userId,
        email: input.email,
        is_staff: false,
      });
    if (userErr && userErr.code !== "23505") {
      return userErr.message;
    }
  }

  const { data: existingOrgs, error: orgLookupErr } = await svc
    .from("organizations")
    .select("id")
    .eq("id", input.tenantId)
    .limit(1);
  if (orgLookupErr) {
    return orgLookupErr.message;
  }

  if (existingOrgs?.length) {
    const { error: orgUpdateErr } = await svc
      .from("organizations")
      .update({
        name: businessName,
        plan_tier: plan,
      })
      .eq("id", input.tenantId);
    if (orgUpdateErr) {
      return orgUpdateErr.message;
    }
  } else {
    const { error: orgInsertErr } = await svc
      .from("organizations")
      .insert({
        id: input.tenantId,
        name: businessName,
        org_type: "BUSINESS",
        metadata_json: { source: "client_onboarding" },
        plan_tier: plan,
        usage_limits_json: {},
        posting_paused: true,
        is_active: false,
      });
    if (orgInsertErr) {
      return orgInsertErr.message;
    }
  }

  const { error: membershipErr } = await svc
    .from("memberships")
    .upsert(
      {
        user_id: input.userId,
        tenant_id: input.tenantId,
        role: "owner",
        app_role: "client",
        is_primary: true,
      },
      { onConflict: "user_id,tenant_id" },
    );
  return membershipErr?.message ?? null;
}

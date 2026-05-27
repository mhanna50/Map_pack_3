import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient as createServiceClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export type LeadRecoverySettingsRow = {
  id: string;
  tenant_id: string;
  enabled: boolean;
  business_phone: string | null;
  owner_notification_phone: string | null;
  owner_notification_email: string | null;
  business_name: string | null;
  twilio_phone_number: string | null;
  twilio_phone_sid: string | null;
  forwarding_status: string;
  verification_status: string;
  last_verification_attempt_at: string | null;
  verified_at: string | null;
  test_call_from_phone: string | null;
  last_test_call_sid: string | null;
  consent_confirmed: boolean;
  missed_call_textback_enabled: boolean;
  intake_questions_enabled: boolean;
  owner_notifications_enabled: boolean;
  no_response_followup_enabled: boolean;
  completed_job_review_request_enabled: boolean;
  created_at?: string;
  updated_at?: string;
};

export const jsonError = (message: string, status: number, code?: string) =>
  NextResponse.json({ error: message, code }, { status });

export const hasSupabaseConfig = () => Boolean(supabaseUrl && anonKey && serviceKey);

export const serviceClient = () =>
  createServiceClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

export async function resolveRequestUser(request: NextRequest): Promise<{ id: string; email: string } | null> {
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();

  if (bearerToken) {
    const tokenClient = createServiceClient(supabaseUrl, anonKey, {
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

  const cookieStore = await cookies();
  const supabase = createServerClient(supabaseUrl, anonKey, {
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

export async function resolveTenantId(
  svc: SupabaseClient,
  user: { id: string; email: string },
): Promise<string | null> {
  const email = user.email.trim().toLowerCase();
  const [{ data: profiles }, { data: memberships }, { data: pending }] = await Promise.all([
    svc.from("profiles").select("tenant_id").eq("user_id", user.id).limit(1),
    svc.from("memberships").select("tenant_id").eq("user_id", user.id).limit(1),
    svc
      .from("pending_onboarding")
      .select("tenant_id, invited_at")
      .ilike("email", email)
      .not("tenant_id", "is", null)
      .order("invited_at", { ascending: false })
      .limit(1),
  ]);
  return (
    asString(profiles?.[0]?.tenant_id) ??
    asString(memberships?.[0]?.tenant_id) ??
    asString(pending?.[0]?.tenant_id)
  );
}

export async function getOrCreateSettings(
  svc: SupabaseClient,
  tenantId: string,
): Promise<{ row: LeadRecoverySettingsRow | null; error: string | null }> {
  const { data: existing, error: existingErr } = await svc
    .from("lead_recovery_settings")
    .select("*")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (existingErr) {
    return { row: null, error: existingErr.message };
  }
  if (existing) {
    return { row: existing as LeadRecoverySettingsRow, error: null };
  }

  const { data: inserted, error: insertErr } = await svc
    .from("lead_recovery_settings")
    .insert({
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      enabled: false,
      forwarding_status: "not_configured",
      verification_status: "not_started",
      consent_confirmed: false,
    })
    .select("*")
    .single();
  return { row: (inserted as LeadRecoverySettingsRow | null) ?? null, error: insertErr?.message ?? null };
}

export async function updateSettings(
  svc: SupabaseClient,
  tenantId: string,
  values: Record<string, unknown>,
): Promise<{ row: LeadRecoverySettingsRow | null; error: string | null }> {
  const ensured = await getOrCreateSettings(svc, tenantId);
  if (ensured.error || !ensured.row) return ensured;
  const { data, error } = await svc
    .from("lead_recovery_settings")
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .select("*")
    .single();
  return { row: (data as LeadRecoverySettingsRow | null) ?? null, error: error?.message ?? null };
}

export function normalizePhone(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const value = raw.trim().replace(/[\s().-]+/g, "");
  if (/^\+[1-9]\d{7,14}$/.test(value)) return value;
  if (/^\d{10}$/.test(value)) return `+1${value}`;
  if (/^1\d{10}$/.test(value)) return `+${value}`;
  return null;
}

export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const value = raw.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : null;
}

export function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function requiredContextError() {
  if (!hasSupabaseConfig()) return jsonError("Supabase keys not configured", 500);
  return null;
}

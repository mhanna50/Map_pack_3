import { NextRequest, NextResponse } from "next/server";
import {
  getOrCreateSettings,
  jsonError,
  normalizePhone,
  requiredContextError,
  resolveRequestUser,
  resolveTenantId,
  serviceClient,
  updateSettings,
} from "../utils";

export async function POST(request: NextRequest) {
  const configError = requiredContextError();
  if (configError) return configError;
  const user = await resolveRequestUser(request);
  if (!user) return jsonError("Not authenticated", 401);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const svc = serviceClient();
  const tenantId = await resolveTenantId(svc, user);
  if (!tenantId) return jsonError("Onboarding tenant not found", 409, "tenant_not_found");

  const { row: settings, error } = await getOrCreateSettings(svc, tenantId);
  if (error || !settings) return jsonError(error ?? "Unable to load Lead Recovery setup", 400);
  if (!settings.enabled) return jsonError("Enable Lead Recovery before starting verification.", 409);
  if (!settings.business_phone) return jsonError("Business phone is required before verification.", 409);
  if (!settings.owner_notification_phone && !settings.owner_notification_email) {
    return jsonError("Owner notification phone or email is required before verification.", 409);
  }
  if (!settings.consent_confirmed) return jsonError("Forwarding confirmation is required before verification.", 409);
  if (!settings.twilio_phone_number) return jsonError("Assign a recovery number before verification.", 409);

  const testCallFromPhone = body.test_call_from_phone ? normalizePhone(body.test_call_from_phone) : null;
  if (body.test_call_from_phone && !testCallFromPhone) return jsonError("Enter a valid test call phone number.", 400);
  const now = new Date().toISOString();
  const { row, error: updateError } = await updateSettings(svc, tenantId, {
    forwarding_status: "waiting_for_verification",
    verification_status: "pending",
    last_verification_attempt_at: now,
    test_call_from_phone: testCallFromPhone,
  });
  if (updateError) return jsonError(updateError, 400);
  return NextResponse.json(row);
}

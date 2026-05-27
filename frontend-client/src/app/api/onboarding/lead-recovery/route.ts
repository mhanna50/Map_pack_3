import { NextRequest, NextResponse } from "next/server";
import {
  asString,
  getOrCreateSettings,
  jsonError,
  normalizeEmail,
  normalizePhone,
  requiredContextError,
  resolveRequestUser,
  resolveTenantId,
  serviceClient,
  updateSettings,
} from "./utils";

const allowedFields = new Set([
  "enabled",
  "business_phone",
  "owner_notification_phone",
  "owner_notification_email",
  "business_name",
  "consent_confirmed",
]);

export async function GET(request: NextRequest) {
  const configError = requiredContextError();
  if (configError) return configError;
  const user = await resolveRequestUser(request);
  if (!user) return jsonError("Not authenticated", 401);
  const svc = serviceClient();
  const tenantId = await resolveTenantId(svc, user);
  if (!tenantId) return jsonError("Onboarding tenant not found", 409, "tenant_not_found");
  const { row, error } = await getOrCreateSettings(svc, tenantId);
  if (error) return jsonError(error, 400);
  return NextResponse.json(row);
}

export async function PATCH(request: NextRequest) {
  const configError = requiredContextError();
  if (configError) return configError;
  const user = await resolveRequestUser(request);
  if (!user) return jsonError("Not authenticated", 401);

  const body = (await request.json()) as Record<string, unknown>;
  const enabled = body.enabled === true;
  const businessPhone = normalizePhone(body.business_phone);
  const ownerPhone = normalizePhone(body.owner_notification_phone);
  const ownerEmail = normalizeEmail(body.owner_notification_email);
  const businessName = asString(body.business_name);
  const consentConfirmed = body.consent_confirmed === true;

  if (enabled) {
    if (!businessPhone) return jsonError("Enter a valid business phone number.", 400, "business_phone_required");
    if (!ownerPhone && !ownerEmail) {
      return jsonError("Enter an owner notification phone or email.", 400, "owner_notification_required");
    }
    if (body.owner_notification_phone && !ownerPhone) return jsonError("Enter a valid owner notification phone.", 400);
    if (body.owner_notification_email && !ownerEmail) return jsonError("Enter a valid owner notification email.", 400);
    if (!consentConfirmed) {
      return jsonError("Confirm that missed or unanswered calls must be forwarded to the recovery number.", 400, "consent_required");
    }
  }

  const updates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (allowedFields.has(key)) updates[key] = value;
  }
  updates.enabled = enabled;
  updates.business_phone = businessPhone;
  updates.owner_notification_phone = ownerPhone;
  updates.owner_notification_email = ownerEmail;
  updates.business_name = businessName;
  updates.consent_confirmed = consentConfirmed;
  if (!enabled) {
    updates.forwarding_status = "skipped";
    updates.verification_status = "skipped";
  }

  const svc = serviceClient();
  const tenantId = await resolveTenantId(svc, user);
  if (!tenantId) return jsonError("Onboarding tenant not found", 409, "tenant_not_found");
  const { row, error } = await updateSettings(svc, tenantId, updates);
  if (error) return jsonError(error, 400);
  return NextResponse.json(row);
}

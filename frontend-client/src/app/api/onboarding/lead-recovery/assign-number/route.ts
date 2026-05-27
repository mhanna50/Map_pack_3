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
  const svc = serviceClient();
  const tenantId = await resolveTenantId(svc, user);
  if (!tenantId) return jsonError("Onboarding tenant not found", 409, "tenant_not_found");

  const existing = await getOrCreateSettings(svc, tenantId);
  if (existing.error || !existing.row) return jsonError(existing.error ?? "Unable to load Lead Recovery setup", 400);
  if (existing.row.twilio_phone_number) return NextResponse.json(existing.row);

  const recoveryNumber = normalizePhone(process.env.TWILIO_DEFAULT_FROM_NUMBER ?? process.env.TWILIO_FROM_NUMBER);
  if (!recoveryNumber) {
    return jsonError(
      "No Twilio recovery number is configured yet. Add TWILIO_DEFAULT_FROM_NUMBER before assigning Lead Recovery numbers.",
      409,
      "twilio_number_not_configured",
    );
  }

  const { data: assignedElsewhere, error: assignmentErr } = await svc
    .from("lead_recovery_settings")
    .select("tenant_id")
    .eq("twilio_phone_number", recoveryNumber)
    .neq("tenant_id", tenantId)
    .limit(1);
  if (assignmentErr) return jsonError(assignmentErr.message, 400);
  if ((assignedElsewhere ?? []).length > 0) {
    return jsonError(
      "This Twilio recovery number is already assigned to another client. Add an available number before continuing.",
      409,
      "twilio_number_already_assigned",
    );
  }

  const { row, error } = await updateSettings(svc, tenantId, {
    twilio_phone_number: recoveryNumber,
    twilio_phone_sid: process.env.TWILIO_DEFAULT_PHONE_SID ?? null,
    forwarding_status: existing.row.forwarding_status === "skipped" ? "not_configured" : existing.row.forwarding_status,
    verification_status: existing.row.verification_status === "skipped" ? "not_started" : existing.row.verification_status,
  });
  if (error) return jsonError(error, 400);
  return NextResponse.json(row);
}

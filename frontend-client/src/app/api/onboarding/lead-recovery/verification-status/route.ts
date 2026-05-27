import { NextRequest, NextResponse } from "next/server";
import {
  getOrCreateSettings,
  jsonError,
  requiredContextError,
  resolveRequestUser,
  resolveTenantId,
  serviceClient,
} from "../utils";

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

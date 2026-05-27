import { NextRequest, NextResponse } from "next/server";
import { recordAdminImpersonationAudit, requireAdminUser } from "@/features/admin/adminDb";

const impersonationEnabled = process.env.ALLOW_ADMIN_IMPERSONATION === "true";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeClientPath(value: unknown) {
  const path = typeof value === "string" && value.trim() ? value.trim() : "/dashboard";
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("://")) {
    throw new Error("Invalid impersonation target path");
  }
  if (!path.startsWith("/dashboard") && !path.startsWith("/app")) {
    throw new Error("Invalid impersonation target path");
  }
  return path;
}

export async function POST(request: NextRequest) {
  try {
    if (!impersonationEnabled) {
      console.warn("Impersonation attempt blocked: feature disabled");
      return NextResponse.json({ error: "Impersonation disabled" }, { status: 403 });
    }
    const admin = await requireAdminUser();
    const body = await request.json();
    const { tenantId, reason, targetPath } = body as { tenantId: string; reason?: string; targetPath?: string };
    if (!uuidPattern.test(String(tenantId ?? ""))) {
      return NextResponse.json({ error: "Valid tenantId is required" }, { status: 400 });
    }
    const safeTargetPath = normalizeClientPath(targetPath);
    await recordAdminImpersonationAudit({
      adminUserId: admin.id,
      tenantId,
      action: "started",
      metadata: { reason: String(reason ?? "").slice(0, 500), targetPath: safeTargetPath },
    });
    return NextResponse.json({ started: true, tenantId, reason: String(reason ?? "").slice(0, 500), targetPath: safeTargetPath });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "failed to start impersonation";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

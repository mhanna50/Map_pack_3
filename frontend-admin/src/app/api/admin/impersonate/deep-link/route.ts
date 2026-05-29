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

function withImpersonationTenant(path: string, tenantId: string) {
  const [pathname, search = ""] = path.split("?");
  const params = new URLSearchParams(search);
  params.set("impersonate_tenant", tenantId);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export async function POST(request: NextRequest) {
  try {
    if (!impersonationEnabled) {
      return NextResponse.json({ error: "Impersonation disabled" }, { status: 403 });
    }
    const admin = await requireAdminUser();
    const body = await request.json();
    const tenantId = String(body?.tenantId ?? "");
    const targetPath = normalizeClientPath(body?.targetPath);
    if (!uuidPattern.test(tenantId)) return NextResponse.json({ error: "Valid tenantId is required" }, { status: 400 });
    const impersonationPath = withImpersonationTenant(targetPath, tenantId);
    await recordAdminImpersonationAudit({
      adminUserId: admin.id,
      tenantId,
      action: "deep_link",
      metadata: { targetPath: impersonationPath, module: typeof body?.module === "string" ? body.module.slice(0, 80) : null },
    });
    return NextResponse.json({ started: true, tenantId, targetPath: impersonationPath });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "failed to create impersonation deep link";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

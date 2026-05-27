import { NextRequest, NextResponse } from "next/server";
import { recordAdminImpersonationAudit, requireAdminUser } from "@/features/admin/adminDb";

const impersonationEnabled = process.env.ALLOW_ADMIN_IMPERSONATION === "true";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  try {
    if (!impersonationEnabled) {
      console.warn("Impersonation stop blocked: feature disabled");
      return NextResponse.json({ error: "Impersonation disabled" }, { status: 403 });
    }
    const admin = await requireAdminUser();
    let tenantId: string | null = null;
    try {
      const body = await request.json();
      tenantId = typeof body?.tenantId === "string" ? body.tenantId : null;
    } catch {
      tenantId = null;
    }
    if (tenantId) {
      if (!uuidPattern.test(tenantId)) {
        return NextResponse.json({ error: "Valid tenantId is required" }, { status: 400 });
      }
      await recordAdminImpersonationAudit({ adminUserId: admin.id, tenantId, action: "stopped" });
    }
    return NextResponse.json({ ended: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "failed to stop impersonation";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

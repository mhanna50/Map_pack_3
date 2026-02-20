import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/adminDb";

const impersonationEnabled = process.env.ALLOW_ADMIN_IMPERSONATION === "true";

export async function POST(request: NextRequest) {
  try {
    if (!impersonationEnabled) {
      console.warn("Impersonation attempt blocked: feature disabled");
      return NextResponse.json({ error: "Impersonation disabled" }, { status: 403 });
    }
    const admin = await requireAdminUser();
    const body = await request.json();
    const { tenantId, reason } = body as { tenantId: string; reason?: string };
    // TODO: mint client-scoped session and persist admin_impersonations entry
    return NextResponse.json({ started: true, tenantId, admin: admin.id, reason: reason ?? "" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "failed to start impersonation";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

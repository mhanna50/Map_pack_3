import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/adminDb";

export async function POST(request: NextRequest) {
  try {
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

import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/features/admin/adminDb";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminUser();
    const { id } = await context.params;
    const body = await request.json();
    // Placeholder: wire to billing_subscriptions update + audit log
    return NextResponse.json({ tenantId: id, location_limit: body.location_limit });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "failed to update location limit";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

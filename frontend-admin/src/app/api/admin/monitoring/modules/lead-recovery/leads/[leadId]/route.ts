import { NextRequest, NextResponse } from "next/server";
import { getAdminLeadDetail, requireAdminUser } from "@/features/admin/adminDb";

export async function GET(_request: NextRequest, context: { params: Promise<{ leadId: string }> }) {
  try {
    await requireAdminUser();
    const { leadId } = await context.params;
    return NextResponse.json(await getAdminLeadDetail(leadId));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "failed to load lead";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

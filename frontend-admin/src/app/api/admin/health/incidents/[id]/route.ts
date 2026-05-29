import { NextRequest, NextResponse } from "next/server";
import { getAdminIntegrationIncidentDetail, requireAdminUser } from "@/features/admin/adminDb";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminUser();
    const { id } = await context.params;
    return NextResponse.json(await getAdminIntegrationIncidentDetail(id));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "failed to load incident";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

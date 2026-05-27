import { NextRequest, NextResponse } from "next/server";
import { getAdminClientStats, parseAdminMonitoringFilters, requireAdminUser } from "@/features/admin/adminDb";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminUser();
    const { id } = await context.params;
    const data = await getAdminClientStats(id, parseAdminMonitoringFilters(request.nextUrl.searchParams));
    return NextResponse.json({ rows: data.module_health ?? [] });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "failed to load client module health";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

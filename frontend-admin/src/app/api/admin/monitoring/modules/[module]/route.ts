import { NextRequest, NextResponse } from "next/server";
import { getAdminModuleStats, parseAdminMonitoringFilters, requireAdminUser } from "@/features/admin/adminDb";

export async function GET(request: NextRequest, context: { params: Promise<{ module: string }> }) {
  try {
    await requireAdminUser();
    const { module } = await context.params;
    return NextResponse.json(await getAdminModuleStats(module, parseAdminMonitoringFilters(request.nextUrl.searchParams)));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "failed to load module stats";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

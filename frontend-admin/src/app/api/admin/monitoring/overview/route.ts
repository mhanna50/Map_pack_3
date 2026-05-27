import { NextRequest, NextResponse } from "next/server";
import { getAdminOverviewStats, parseAdminMonitoringFilters, requireAdminUser } from "@/features/admin/adminDb";

export async function GET(request: NextRequest) {
  try {
    await requireAdminUser();
    return NextResponse.json(await getAdminOverviewStats(parseAdminMonitoringFilters(request.nextUrl.searchParams)));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "failed to load admin overview";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { fetchAudit, requireAdminUser } from "@/lib/adminDb";

export async function GET(request: NextRequest) {
  try {
    await requireAdminUser();
    const { searchParams } = new URL(request.url);
    const page = Number(searchParams.get("page") ?? "1");
    const pageSize = Number(searchParams.get("pageSize") ?? "30");
    const data = await fetchAudit({ page, pageSize });
    return NextResponse.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "failed to load audit log";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

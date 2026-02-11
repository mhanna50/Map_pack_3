import { NextRequest, NextResponse } from "next/server";
import { fetchTenants, requireAdminUser } from "@/lib/adminDb";

export async function GET(request: NextRequest) {
  try {
    await requireAdminUser();
    const { searchParams } = new URL(request.url);
    const page = Number(searchParams.get("page") ?? "1");
    const pageSize = Number(searchParams.get("pageSize") ?? "20");
    const status = searchParams.get("status") ?? undefined;
    const plan = searchParams.get("plan") ?? undefined;
    const q = searchParams.get("q") ?? undefined;
    const data = await fetchTenants({ page, pageSize, status, plan, q });
    return NextResponse.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "failed to load tenants";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

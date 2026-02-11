import { NextRequest, NextResponse } from "next/server";
import { fetchTenantDetail, requireAdminUser } from "@/lib/adminDb";

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdminUser();
    const data = await fetchTenantDetail(params.id);
    return NextResponse.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "failed to load tenant";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

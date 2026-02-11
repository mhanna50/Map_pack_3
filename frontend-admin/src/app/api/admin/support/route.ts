import { NextRequest, NextResponse } from "next/server";
import { fetchSupport, requireAdminUser } from "@/lib/adminDb";

export async function GET(request: NextRequest) {
  try {
    await requireAdminUser();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") ?? undefined;
    const data = await fetchSupport({ status });
    return NextResponse.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "failed to load support tickets";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

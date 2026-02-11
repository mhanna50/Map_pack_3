import { NextResponse } from "next/server";
import { fetchKpis, requireAdminUser } from "@/lib/adminDb";

export async function GET() {
  try {
    await requireAdminUser();
    const data = await fetchKpis();
    return NextResponse.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "failed to load kpis";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

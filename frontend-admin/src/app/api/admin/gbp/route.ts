import { NextResponse } from "next/server";
import { fetchGbp, requireAdminUser } from "@/lib/adminDb";

export async function GET() {
  try {
    await requireAdminUser();
    const data = await fetchGbp();
    return NextResponse.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "failed to load gbp connections";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

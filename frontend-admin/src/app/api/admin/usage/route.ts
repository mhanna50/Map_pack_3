import { NextResponse } from "next/server";
import { fetchUsage, requireAdminUser } from "@/lib/adminDb";

export async function GET() {
  try {
    await requireAdminUser();
    const data = await fetchUsage();
    return NextResponse.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "failed to load usage";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

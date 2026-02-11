import { NextResponse } from "next/server";
import { fetchBilling, requireAdminUser } from "@/lib/adminDb";

export async function GET() {
  try {
    await requireAdminUser();
    const data = await fetchBilling();
    return NextResponse.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "failed to load billing";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

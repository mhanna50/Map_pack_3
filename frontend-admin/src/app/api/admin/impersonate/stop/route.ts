import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/adminDb";

export async function POST() {
  try {
    await requireAdminUser();
    // TODO: clear impersonation session server-side
    return NextResponse.json({ ended: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "failed to stop impersonation";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

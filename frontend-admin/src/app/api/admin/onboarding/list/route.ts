import { NextResponse } from "next/server";
import { listPendingOnboarding, requireAdminUser } from "@/lib/adminDb";

export async function GET() {
  try {
    await requireAdminUser();
    const rows = await listPendingOnboarding();
    return NextResponse.json({ rows });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "failed to load onboarding list";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser, deletePendingOnboarding, revokeSupabaseInvite } from "@/lib/adminDb";

export async function POST(request: NextRequest) {
  try {
    await requireAdminUser();
    const { email } = await request.json();
    await revokeSupabaseInvite(email);
    const result = await deletePendingOnboarding(email);
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "failed to delete invite";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

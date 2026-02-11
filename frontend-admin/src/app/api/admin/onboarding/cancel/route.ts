import { NextRequest, NextResponse } from "next/server";
import { cancelPendingOnboarding, requireAdminUser } from "@/lib/adminDb";

export async function POST(request: NextRequest) {
  try {
    await requireAdminUser();
    const { email } = await request.json();
    const result = await cancelPendingOnboarding(email);
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "failed to cancel invite";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/features/admin/adminDb";

export async function POST(request: NextRequest) {
  try {
    await requireAdminUser();
    const { email } = await request.json();
    return NextResponse.json({
      deleted: true,
      frontendOnly: true,
      email: String(email ?? "").trim().toLowerCase(),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "failed to delete invite";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

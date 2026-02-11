import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/adminDb";

export async function GET() {
  try {
    const user = await requireAdminUser();
    return NextResponse.json({ isAdmin: true, email: user.email });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "unauthorized";
    return NextResponse.json({ isAdmin: false, error: message }, { status: 401 });
  }
}

import { NextResponse } from "next/server";
import { getAdminRolesOverview, requireAdminUser } from "@/features/admin/adminDb";

export async function GET() {
  try {
    const admin = await requireAdminUser();
    return NextResponse.json(await getAdminRolesOverview(admin));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "failed to load roles";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/adminDb";

const impersonationEnabled = process.env.ALLOW_ADMIN_IMPERSONATION === "true";

export async function POST() {
  try {
    if (!impersonationEnabled) {
      console.warn("Impersonation stop blocked: feature disabled");
      return NextResponse.json({ error: "Impersonation disabled" }, { status: 403 });
    }
    await requireAdminUser();
    // TODO: clear impersonation session server-side
    return NextResponse.json({ ended: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "failed to stop impersonation";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

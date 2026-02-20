import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser, upsertPendingOnboarding, sendSupabaseInvite } from "@/lib/adminDb";

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdminUser();
    const body = await request.json();
    const clientBase =
      process.env.NEXT_PUBLIC_CLIENT_APP_URL || process.env.CLIENT_APP_URL || "http://localhost:3000";
    const redirectTo = `${clientBase.replace(/\/$/, "")}/onboarding?step=account`;

    const { pending } = await upsertPendingOnboarding({
      email: body.email,
      invited_by: admin.id,
    });

    const invite = await sendSupabaseInvite(body.email, redirectTo);

    return NextResponse.json({ link: invite.inviteLink, emailed: invite.emailed, pending });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "failed to create invite";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

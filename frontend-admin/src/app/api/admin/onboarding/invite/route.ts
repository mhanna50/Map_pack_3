import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser, upsertPendingOnboarding, sendSupabaseInvite } from "@/lib/adminDb";

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdminUser();
    const body = await request.json();
    const redirectTo = "https://yourapp.com/onboarding?step=account";

    const { pending } = await upsertPendingOnboarding({
      email: body.email,
      business_name: body.business_name,
      first_name: body.first_name,
      last_name: body.last_name,
      plan: body.plan,
      location_limit: body.location_limit,
      invited_by: admin.id,
    });

    const invite = await sendSupabaseInvite(body.email, redirectTo);

    return NextResponse.json({ link: invite.inviteLink, emailed: invite.emailed, pending });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "failed to create invite";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

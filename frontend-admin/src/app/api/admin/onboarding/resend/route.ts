import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser, sendSupabaseInvite, upsertPendingOnboarding } from "@/lib/adminDb";

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdminUser();
    const { email, plan, location_limit, business_name, first_name, last_name } = await request.json();
    const redirectTo = "https://yourapp.com/onboarding?step=account";

    if (plan && location_limit) {
      await upsertPendingOnboarding({
        email,
        business_name,
        first_name,
        last_name,
        plan,
        location_limit,
        invited_by: admin.id,
      });
    }

    const invite = await sendSupabaseInvite(email, redirectTo);
    return NextResponse.json({ emailed: invite.emailed, link: invite.inviteLink });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "failed to resend invite";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

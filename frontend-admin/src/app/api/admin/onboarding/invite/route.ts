import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser, upsertPendingOnboarding, sendSupabaseInvite } from "@/lib/adminDb";

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdminUser();
    const rateKey = `admin-invite-${admin.id}`;
    if (!rateGuard(rateKey)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }
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

const WINDOW_MS = 60_000;
const LIMIT = 30;
// Very light in-memory rate guard per admin user
function rateGuard(key: string): boolean {
  const now = Date.now();
  // @ts-expect-error attach to global
  const store = (globalThis.__adminInviteRate__ = globalThis.__adminInviteRate__ || new Map());
  const bucket = store.get(key) || [];
  const recent = bucket.filter((t: number) => now - t < WINDOW_MS);
  recent.push(now);
  store.set(key, recent);
  return recent.length <= LIMIT;
}

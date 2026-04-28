import { NextRequest, NextResponse } from "next/server";
import { cancelOnboardingInviteAndPurge, requireAdminUser } from "@/features/admin/adminDb";

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  if (typeof error === "string" && error.trim()) {
    return error;
  }
  if (typeof error === "object" && error !== null) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }
  return "failed to cancel invite";
}

export async function POST(request: NextRequest) {
  const requestId = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  let normalizedEmail: string | null = null;
  try {
    const admin = await requireAdminUser();
    const { email } = await request.json();
    normalizedEmail = String(email ?? "").trim().toLowerCase();
    console.info("[admin/onboarding/cancel] start", {
      requestId,
      adminUserId: admin.id,
      email: normalizedEmail,
    });
    const result = await cancelOnboardingInviteAndPurge(normalizedEmail);
    console.info("[admin/onboarding/cancel] success", {
      requestId,
      adminUserId: admin.id,
      email: normalizedEmail,
      canceled: result.canceled,
      resendReady: result.resendReady,
      deletedAuthUsers: result.deletedAuthUsers,
      deletedPublicRows: result.deletedPublicRows,
      message: result.message,
    });
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = extractErrorMessage(error);
    console.error("[admin/onboarding/cancel] failed", {
      requestId,
      email: normalizedEmail,
      error,
      message,
    });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

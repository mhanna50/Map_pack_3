import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser, upsertPendingOnboarding } from "@/lib/adminDb";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdminUser();
    const { email, plan, location_limit, business_name, first_name, last_name } = await request.json();
    const normalizedEmail = String(email ?? "").trim().toLowerCase();
    if (!normalizedEmail) {
      return NextResponse.json({ error: "email is required" }, { status: 400 });
    }

    const guard = emailRateGuard(normalizedEmail);
    if (!guard.allowed) {
      return NextResponse.json(
        { emailed: false, link: null, status: "rate_limited", retryAfterMs: guard.retryAfterMs },
        { status: 200 },
      );
    }
    const clientBase =
      process.env.NEXT_PUBLIC_CLIENT_APP_URL || process.env.CLIENT_APP_URL || "http://localhost:3000";
    const redirectTo = `${clientBase.replace(/\/$/, "")}/onboarding?step=account&invite_email=${encodeURIComponent(normalizedEmail)}`;

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await upsertPendingOnboarding({
      email: normalizedEmail,
      business_name,
      first_name,
      last_name,
      plan,
      location_limit,
      invited_by: admin.id,
      expires_at: expiresAt,
      status: "invited",
    });

    // Use Supabase built-in email sender: generate magic link + send OTP email.
    // If that fails, fall back to inviteUserByEmail so the admin UI still gets a link.
    const svc = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    let actionLink: string | null = null;
    let emailed = false;

    try {
      const { data: magic, error: magicErr } = await svc.auth.admin.generateLink({
        type: "magiclink",
        email: normalizedEmail,
        options: { redirectTo },
      });
      if (magicErr) throw magicErr;
      actionLink = magic?.properties?.action_link ?? null;

      const { error: otpErr } = await svc.auth.signInWithOtp({
        email: normalizedEmail,
        options: { emailRedirectTo: redirectTo, shouldCreateUser: true },
      });
      if (otpErr) throw otpErr;
      emailed = true;
    } catch (magicError) {
      const rateLimited = isSupabaseEmailRateLimitError(magicError);
      if (rateLimited) {
        const retryAfterMs = getRetryAfterMs(magicError);
        markEmailRateLimited(normalizedEmail, retryAfterMs);
        return NextResponse.json({
          emailed: false,
          link: null,
          status: "rate_limited",
          retryAfterMs,
          error: "Supabase email rate limit; try again in ~60s.",
        });
      }
      console.warn("Resend magiclink failed; falling back to inviteUserByEmail", magicError);
      const { data, error } = await svc.auth.admin.inviteUserByEmail(normalizedEmail, { redirectTo });
      if (error) {
        if (isSupabaseEmailRateLimitError(error)) {
          const retryAfterMs = getRetryAfterMs(error);
          markEmailRateLimited(normalizedEmail, retryAfterMs);
          return NextResponse.json({
            emailed: false,
            link: null,
            status: "rate_limited",
            retryAfterMs,
            error: "Supabase email rate limit; try again in ~60s.",
          });
        }
        throw error;
      }
      actionLink = ((data as { action_link?: string | null } | null)?.action_link ?? null);
      emailed = true; // Supabase may suppress if user exists, but we still return success + link
    }

    return NextResponse.json({ emailed, link: actionLink, status: "invited" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "failed to resend invite";
    // If the user already exists, still return the link (Supabase won't send another email)
    if (message.includes("already been registered")) {
      return NextResponse.json({ emailed: false, link: null, status: "already_registered", error: message }, { status: 200 });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

const WINDOW_MS = 60_000;
function emailRateGuard(email: string): { allowed: boolean; retryAfterMs: number } {
  // @ts-expect-error attach to global
  const store: Map<string, number> = (globalThis.__resendEmailRate__ = globalThis.__resendEmailRate__ || new Map());
  const now = Date.now();
  const last = store.get(email) ?? 0;
  if (now - last < WINDOW_MS) {
    return { allowed: false, retryAfterMs: WINDOW_MS - (now - last) };
  }
  store.set(email, now);
  return { allowed: true, retryAfterMs: 0 };
}

function markEmailRateLimited(email: string, retryAfterMs = WINDOW_MS) {
  // @ts-expect-error attach to global
  const store: Map<string, number> = (globalThis.__resendEmailRate__ = globalThis.__resendEmailRate__ || new Map());
  const clampedRetryMs = Math.max(1, Math.min(WINDOW_MS, retryAfterMs));
  store.set(email, Date.now() - (WINDOW_MS - clampedRetryMs));
}

function isSupabaseEmailRateLimitError(error: unknown): boolean {
  const status = normalizeStatusCode((error as { status?: number | string } | null)?.status);
  if (status === 429) return true;

  const code = (error as { code?: string } | null)?.code?.toLowerCase() ?? "";
  if (code === "over_email_send_rate_limit") return true;

  const message = (error as { message?: string } | null)?.message?.toLowerCase() ?? "";
  return message.includes("for security purposes, you can only request this after");
}

function getRetryAfterMs(error: unknown): number {
  const message = (error as { message?: string } | null)?.message ?? "";
  const match = message.match(/after\s+(\d+)\s+seconds?/i);
  const seconds = match?.[1] ? Number.parseInt(match[1], 10) : NaN;
  if (!Number.isFinite(seconds) || seconds <= 0) return WINDOW_MS;
  return Math.max(1_000, seconds * 1_000);
}

function normalizeStatusCode(status: number | string | undefined): number | undefined {
  if (typeof status === "number") return status;
  if (typeof status !== "string") return undefined;
  const parsed = Number.parseInt(status, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

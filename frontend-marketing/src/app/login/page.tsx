"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

import { createClient } from "@/lib/supabase/client";

const calendlyUrl = "https://calendly.com";
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
const CLIENT_APP_URL = process.env.NEXT_PUBLIC_CLIENT_APP_URL ?? "http://localhost:3000";
const ADMIN_APP_URL = process.env.NEXT_PUBLIC_ADMIN_APP_URL ?? "http://localhost:3002";
const ADMIN_ROLE_VALUES = new Set(["admin", "staff", "owner", "super_admin", "superadmin"]);
const COMPLETED_PENDING_STATUSES = new Set(["google_pending", "google_connected", "completed", "activated"]);
const ACTIVE_BILLING_STATUSES = new Set(["active", "trialing", "past_due"]);
const ONBOARDING_STATUS_RANK: Record<string, number> = {
  in_progress: 0,
  business_setup: 1,
  stripe_pending: 2,
  stripe_started: 3,
  google_pending: 4,
  google_connected: 5,
  completed: 6,
  activated: 6,
  canceled: -1,
};

const inferIsAdmin = (role?: string | null, isStaff?: boolean | null) => {
  if (isStaff) return true;
  if (!role || typeof role !== "string") return false;
  return ADMIN_ROLE_VALUES.has(role.toLowerCase());
};

const normalizeStatus = (value: unknown): string => String(value ?? "").trim().toLowerCase();

const extractTenantIds = (rows: Array<{ tenant_id?: unknown }> | null | undefined): string[] =>
  (rows ?? [])
    .map((row) => (typeof row.tenant_id === "string" && row.tenant_id.trim() ? row.tenant_id.trim() : null))
    .filter((value): value is string => Boolean(value));

const sortPendingRows = <T extends { status?: unknown; invited_at?: string | null }>(rows: T[]): T[] =>
  [...rows].sort((a, b) => {
    const leftTime = a.invited_at ? Date.parse(a.invited_at) : 0;
    const rightTime = b.invited_at ? Date.parse(b.invited_at) : 0;
    if (rightTime !== leftTime) return rightTime - leftTime;
    const left = ONBOARDING_STATUS_RANK[normalizeStatus(a.status)] ?? -999;
    const right = ONBOARDING_STATUS_RANK[normalizeStatus(b.status)] ?? -999;
    return right - left;
  });

const pickPreferredPendingRow = <T extends { status?: unknown; invited_at?: string | null; tenant_id?: unknown }>(
  rows: T[] | null | undefined,
  tenantHints?: Set<string>,
): T | null => {
  if (!rows?.length) return null;

  if (tenantHints && tenantHints.size > 0) {
    const tenantMatched = rows.filter(
      (row) => typeof row.tenant_id === "string" && tenantHints.has(row.tenant_id),
    );
    if (tenantMatched.length > 0) {
      return sortPendingRows(tenantMatched)[0];
    }
  }

  const unclaimedRows = rows.filter((row) => row.tenant_id === null || row.tenant_id === undefined || row.tenant_id === "");
  if (unclaimedRows.length > 0) {
    return sortPendingRows(unclaimedRows)[0];
  }

  return sortPendingRows(rows)[0];
};

const pickTenantId = (
  rows: Array<{ tenant_id?: string | null }> | null | undefined,
): string | null => {
  return extractTenantIds(rows)[0] ?? null;
};

async function isClientOnboardingCompleted(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  email: string,
): Promise<boolean> {
  const normalizedEmail = email.trim().toLowerCase();
  const [pendingResult, profileResult, membershipResult] = await Promise.all([
    supabase
      .from("pending_onboarding")
      .select("status, tenant_id, invited_at")
      .ilike("email", normalizedEmail)
      .limit(50),
    supabase.from("profiles").select("tenant_id").eq("user_id", userId).limit(50),
    supabase.from("memberships").select("tenant_id").eq("user_id", userId).limit(50),
  ]);

  if (pendingResult.error) throw pendingResult.error;
  if (profileResult.error) throw profileResult.error;
  if (membershipResult.error) throw membershipResult.error;

  const pendingRows = pendingResult.data ?? [];
  const tenantHints = new Set([
    ...extractTenantIds(profileResult.data ?? []),
    ...extractTenantIds(membershipResult.data ?? []),
  ]);
  const preferredPending = pickPreferredPendingRow(pendingRows, tenantHints);
  const pendingCompleted = COMPLETED_PENDING_STATUSES.has(normalizeStatus(preferredPending?.status));
  const tenantId =
    pickTenantId(profileResult.data ?? []) ??
    pickTenantId(membershipResult.data ?? []) ??
    preferredPending?.tenant_id ??
    null;

  if (!tenantId) {
    return pendingCompleted;
  }

  const [tenantResult, billingResult] = await Promise.all([
    supabase.from("tenants").select("status").eq("tenant_id", tenantId).limit(1),
    supabase.from("billing_subscriptions").select("status").eq("tenant_id", tenantId).limit(50),
  ]);

  if (tenantResult.error) throw tenantResult.error;
  if (billingResult.error) throw billingResult.error;

  const tenantActive = normalizeStatus(tenantResult.data?.[0]?.status) === "active";
  const hasActiveBilling = (billingResult.data ?? []).some((row) =>
    ACTIVE_BILLING_STATUSES.has(normalizeStatus(row.status)),
  );

  return pendingCompleted || tenantActive || hasActiveBilling;
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (authError) {
        throw authError;
      }

      const session = data.session ?? (await supabase.auth.getSession()).data.session;
      const token = session?.access_token;
      if (!token) {
        throw new Error("Session missing after sign-in.");
      }

      let isAdmin = false;
      try {
        const response = await fetch(`${API_BASE_URL}/auth/me`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (response.ok) {
          const profile = await response.json();
          isAdmin = Boolean(profile?.is_staff);
        }
      } catch {
        // fall back to Supabase metadata checks below
      }

      if (!isAdmin) {
        const user = session?.user;
        const role = user?.app_metadata?.role ?? user?.user_metadata?.role;
        const isStaff = user?.app_metadata?.is_staff ?? user?.user_metadata?.is_staff;
        isAdmin = inferIsAdmin(role ?? null, isStaff ?? null);
      }

      let targetUrl = ADMIN_APP_URL;
      if (!isAdmin) {
        const userId = session?.user?.id;
        const userEmail = session?.user?.email ?? email.trim().toLowerCase();
        if (!userId || !userEmail) {
          throw new Error("Unable to verify account onboarding status.");
        }

        const onboardingCompleted = await isClientOnboardingCompleted(supabase, userId, userEmail);
        const clientBase = CLIENT_APP_URL.replace(/\/$/, "");
        targetUrl = onboardingCompleted ? `${clientBase}/dashboard` : `${clientBase}/onboarding`;
      }
      if (!targetUrl) {
        throw new Error("Dashboard URL configuration is missing.");
      }
      window.location.assign(targetUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex max-w-5xl flex-col gap-10 px-6 py-10">
        <header className="flex items-center justify-between text-sm font-semibold text-slate-200">
          <Link href="/">Map Pack 3</Link>
          <Link href="/" className="text-accent transition hover:text-accent/80">
            Back to marketing
          </Link>
        </header>

        <div className="grid gap-8 md:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-3xl border border-white/10 bg-card p-8 shadow-sm shadow-blue-500/10">
            <p className="text-sm uppercase tracking-[0.3em] text-accent">Existing clients</p>
            <h1 className="mt-3 text-3xl font-semibold text-white">Log in to your account</h1>
            <p className="mt-3 text-sm text-slate-300">
              Use your credentials to access the client or admin dashboard.
            </p>

            <form className="mt-8 grid gap-5" onSubmit={handleSubmit}>
              {error && <p className="rounded-2xl bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</p>}
              <div className="grid gap-2">
                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400" htmlFor="email">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  placeholder="you@company.com"
                  className="rounded-2xl border border-white/10 bg-background/40 px-4 py-3 text-sm text-white placeholder:text-slate-400 focus:border-accent focus:outline-none"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>
              <div className="grid gap-2">
                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400" htmlFor="password">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  className="rounded-2xl border border-white/10 bg-background/40 px-4 py-3 text-sm text-white placeholder:text-slate-400 focus:border-accent focus:outline-none"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </div>
              <button
                type="submit"
                className="rounded-full bg-secondary px-6 py-3 text-sm font-semibold text-white transition hover:bg-secondary/90 disabled:opacity-60"
                disabled={loading}
              >
                {loading ? "Signing in..." : "Sign in"}
              </button>
              <p className="text-xs text-slate-400">
                Having trouble?{" "}
                <a href="mailto:support@mappack3.com" className="text-accent underline underline-offset-4">
                  Contact support
                </a>
              </p>
            </form>
          </section>

          <aside className="rounded-3xl border border-white/10 bg-primary/15 p-8">
            <div className="space-y-4">
              <p className="text-sm uppercase tracking-[0.3em] text-accent">New here?</p>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-2xl font-semibold text-white">Book a call with us</h2>
                <a
                  href={calendlyUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center rounded-full bg-secondary px-5 py-2 text-sm font-semibold text-white transition hover:bg-secondary/90"
                >
                  Calendly
                </a>
              </div>
              <p className="text-sm text-slate-300">
                If you do not have an account yet, we will walk you through automations, pricing, and setup.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

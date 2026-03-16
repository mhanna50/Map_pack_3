"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import {
  normalizePostLoginResolution,
  resolveClientAppDestination,
} from "@/lib/post-login-routing";

const ADMIN_APP_URL = process.env.NEXT_PUBLIC_ADMIN_APP_URL ?? "http://localhost:3002";
const INVALID_ROLE_MESSAGE =
  "Invalid role. This account is not assigned to owner/admin or client access.";

export default function Page() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inviteError = searchParams?.get("error") === "invite_required"
    ? "No active onboarding invite was found for this account. Ask an admin to send your invite link."
    : null;

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
      if (!session?.user?.id) {
        throw new Error("Unable to verify account session.");
      }

      const { data: routeData, error: routeError } = await supabase.rpc(
        "resolve_post_login_destination",
      );
      if (routeError) {
        throw routeError;
      }
      const resolution = normalizePostLoginResolution(routeData);

      if (resolution.role === "invalid") {
        await supabase.auth.signOut();
        throw new Error(INVALID_ROLE_MESSAGE);
      }

      if (resolution.role === "owner_admin") {
        const adminBase = ADMIN_APP_URL.replace(/\/$/, "");
        window.location.assign(`${adminBase}/admin`);
        return;
      }

      const target = resolveClientAppDestination(
        resolution,
        searchParams?.get("redirect"),
      );
      router.push(target);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <form onSubmit={handleSubmit} className="w-full max-w-md space-y-6 rounded-3xl bg-white p-8 shadow-sm">
        <div className="space-y-1 text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-primary">Welcome back</p>
          <h1 className="text-2xl font-semibold text-slate-900">Sign in</h1>
          <p className="text-sm text-slate-600">Use the email you paid with to access your dashboard.</p>
        </div>
        {inviteError && <p className="rounded-2xl bg-amber-50 px-3 py-2 text-sm text-amber-700">{inviteError}</p>}
        {error && <p className="rounded-2xl bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
        <label className="block text-sm">
          <span className="text-slate-600">Work email</span>
          <input
            className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@agency.com"
            required
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-600">Password</span>
          <input
            className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
            required
          />
        </label>
        <button
          type="submit"
          className="w-full rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          disabled={loading}
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>
        <div className="flex items-center justify-between text-sm text-slate-500">
          <Link href="/reset-password" className="font-semibold text-primary">
            Forgot password?
          </Link>
          <Link href="/sign-up" className="font-semibold text-primary">
            Create account
          </Link>
        </div>
      </form>
    </div>
  );
}

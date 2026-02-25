"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

export default function Page() {
  const router = useRouter();
  const searchParams = useSearchParams();
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
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (authError) {
        throw authError;
      }
      const redirect = searchParams?.get("redirect") || "/onboarding";
      router.push(redirect);
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

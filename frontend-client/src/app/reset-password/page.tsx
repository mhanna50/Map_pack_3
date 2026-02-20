"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const supabase = createClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/sign-in`,
      });
      if (resetError) {
        throw resetError;
      }
      setMessage("Check your inbox for the password reset link.");
      setEmail("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send reset link");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <form onSubmit={handleSubmit} className="w-full max-w-md space-y-6 rounded-3xl bg-white p-8 shadow-sm">
        <div className="space-y-1 text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-primary">Security</p>
          <h1 className="text-2xl font-semibold text-slate-900">Reset password</h1>
          <p className="text-sm text-slate-600">We will email you a secure reset link.</p>
        </div>
        {error && <p className="rounded-2xl bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
        {message && <p className="rounded-2xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p>}
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
        <button
          type="submit"
          className="w-full rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          disabled={loading}
        >
          {loading ? "Sending..." : "Send reset link"}
        </button>
        <p className="text-center text-sm text-slate-500">
          Remembered password?{" "}
          <Link href="/sign-in" className="font-semibold text-primary">
            Back to login
          </Link>
        </p>
      </form>
    </div>
  );
}

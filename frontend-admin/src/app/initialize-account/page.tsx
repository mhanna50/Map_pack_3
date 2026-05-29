"use client";

import { FormEvent, Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

const PASSWORD_SET_METADATA_KEY = "admin_password_set_at";

function safeLocalRedirect(value: string | null | undefined): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/admin";
}

export default function InitializeAccountPage() {
  return (
    <Suspense fallback={<InitializeShell status="Preparing account setup..." />}>
      <InitializeAccountContent />
    </Suspense>
  );
}

function InitializeAccountContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState("Verifying invite...");
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);

  const bootstrapSession = useCallback(async () => {
    const supabase = createClient();
    try {
      if (typeof window !== "undefined") {
        const hash = window.location.hash;
        if (hash.includes("access_token")) {
          const params = new URLSearchParams(hash.slice(1));
          const accessToken = params.get("access_token");
          const refreshToken = params.get("refresh_token");
          if (accessToken && refreshToken) {
            const { error: sessionError } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            if (sessionError) throw sessionError;
            window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
          }
        }
      }

      const code = searchParams?.get("code");
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) throw exchangeError;
      }

      const tokenHash = searchParams?.get("token_hash");
      if (tokenHash) {
        const type = searchParams?.get("type") || "invite";
        const { error: verifyError } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: type as "invite",
        });
        if (verifyError) throw verifyError;
      }

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) {
        throw userError ?? new Error("Invite session was not found. Open the latest invite email again.");
      }

      setEmail(user.email ?? null);
      setReady(true);
      setStatus("Create a password to finish setting up this admin account.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to verify this invite.");
      setStatus("Invite verification failed.");
    }
  }, [searchParams]);

  useEffect(() => {
    void bootstrapSession();
  }, [bootstrapSession]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSaving(true);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({
        password,
        data: { [PASSWORD_SET_METADATA_KEY]: new Date().toISOString() },
      });
      if (updateError) throw updateError;

      const redirect = safeLocalRedirect(searchParams?.get("redirect"));
      router.replace(redirect);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to set password.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <form onSubmit={handleSubmit} className="w-full max-w-md space-y-6 rounded-3xl bg-white p-8 shadow-sm">
        <div className="space-y-1 text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-primary">Admin access</p>
          <h1 className="text-2xl font-semibold text-slate-900">Initialize account</h1>
          <p className="text-sm text-slate-600">{status}</p>
          {email && <p className="text-sm font-medium text-slate-800">{email}</p>}
        </div>
        {error && <p className="rounded-2xl bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
        <label className="block text-sm">
          <span className="text-slate-600">Password</span>
          <input
            className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="At least 8 characters"
            required
            disabled={!ready || saving}
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-600">Confirm password</span>
          <input
            className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2"
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="Repeat password"
            required
            disabled={!ready || saving}
          />
        </label>
        <button
          type="submit"
          className="w-full rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          disabled={!ready || saving}
        >
          {saving ? "Saving..." : "Finish setup"}
        </button>
        <p className="text-center text-sm text-slate-500">
          Already initialized?{" "}
          <Link href="/sign-in" className="font-semibold text-primary">
            Back to login
          </Link>
        </p>
      </form>
    </div>
  );
}

function InitializeShell({ status }: { status: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 text-sm text-slate-600">
      {status}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getAccessToken } from "@/lib/supabase/session";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export default function GoogleCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState("Finishing Google connection…");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    if (!code || !state) {
      setError("Missing code or state from Google.");
      return;
    }
    const handleCallback = async () => {
      try {
        const token = await getAccessToken();
        if (!token) {
          throw new Error("Sign in to finish connecting Google.");
        }
        const redirectUri = `${window.location.origin}/onboarding/google/callback`;
        const response = await fetch(`${API_BASE_URL}/google/oauth/callback`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ code, state, redirect_uri: redirectUri }),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.detail || "Google authorization failed");
        }
        const data = await response.json();
        const firstAccount = data.connected_accounts?.[0];
        if (typeof window !== "undefined") {
          if (firstAccount?.organization_id) {
            sessionStorage.setItem("onboarding.orgId", firstAccount.organization_id);
          }
          sessionStorage.setItem("onboarding.googleConnected", "true");
        }
        setStatus("Connected! Redirecting you back…");
        setTimeout(() => router.push("/onboarding"), 1200);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to complete Google connection");
      }
    };
    void handleCallback();
  }, [router, searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-sm">
        <p className="text-xs uppercase tracking-[0.3em] text-primary">Google OAuth</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Connecting your account</h1>
        {!error ? (
          <p className="mt-4 text-sm text-slate-600">{status}</p>
        ) : (
          <div className="mt-4 text-sm text-rose-600">
            <p>{error}</p>
            <button
              className="mt-4 rounded-full border border-rose-200 px-4 py-2 text-xs font-semibold text-rose-700"
              onClick={() => router.push("/onboarding")}
            >
              Back to onboarding
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api").replace(/\/+$/, "");

const PLAN_OPTIONS = {
  standard_249: { label: "Map Pack 3 - Standard", price: "$249/month" },
  friends_family: { label: "Map Pack 3 - Friends & Family", price: "$129/month" },
} as const;

const PLAN_ALIASES: Record<string, keyof typeof PLAN_OPTIONS> = {
  standard: "standard_249",
  standard_249: "standard_249",
  map_pack_standard: "standard_249",
  "249": "standard_249",
  base_249: "standard_249",
  friends_family: "friends_family",
  friends_and_family: "friends_family",
  family: "friends_family",
  "129": "friends_family",
  base_129: "friends_family",
};

function normalizeKey(value: string) {
  return value.trim().toLowerCase().replaceAll(" ", "_").replaceAll("-", "_");
}

function normalizePlan(value: string | null): keyof typeof PLAN_OPTIONS {
  if (!value) return "standard_249";
  return PLAN_ALIASES[normalizeKey(value)] ?? "standard_249";
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<div className="min-h-screen px-6 py-12 text-center text-slate-600">Loading checkout…</div>}>
      <CheckoutContent />
    </Suspense>
  );
}

function CheckoutContent() {
  const searchParams = useSearchParams();
  const selectedPlan = normalizePlan(searchParams.get("plan"));
  const [email, setEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/billing/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim(),
          company_name: companyName.trim(),
          plan: selectedPlan,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.detail || "Unable to start checkout");
      }
      const payload = await response.json();
      if (!payload.checkout_url) {
        throw new Error("Stripe session missing URL");
      }
      if (typeof window !== "undefined") {
        window.location.href = payload.checkout_url;
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to start checkout");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 px-6 py-12">
      <div className="mx-auto w-full max-w-lg space-y-8">
        <header className="space-y-2 text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-primary">Stripe Checkout</p>
          <h1 className="text-3xl font-semibold text-slate-900">Start your plan</h1>
          <p className="text-sm text-slate-600">
            You will be redirected to Stripe’s secure checkout page to complete payment.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-5 rounded-3xl bg-white p-8 shadow-sm">
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
            <span className="text-slate-600">Company name</span>
            <input
              className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2"
              type="text"
              value={companyName}
              onChange={(event) => setCompanyName(event.target.value)}
              placeholder="Your agency"
              required
            />
          </label>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
            Service plan:{" "}
            <span className="font-semibold">
              {PLAN_OPTIONS[selectedPlan].label} ({PLAN_OPTIONS[selectedPlan].price})
            </span>
          </div>
          <button
            type="submit"
            className="w-full rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            disabled={submitting}
          >
            {submitting ? "Redirecting to Stripe..." : "Continue to checkout"}
          </button>
          <p className="text-center text-xs text-slate-500">
            Already have an account?{" "}
            <Link href="/sign-in" className="font-semibold text-primary">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}

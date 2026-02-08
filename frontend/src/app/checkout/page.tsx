"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
const planOptions = ["starter", "pro", "agency"] as const;
type Plan = (typeof planOptions)[number];

const normalizePlan = (value: string | null): Plan | null => {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return planOptions.includes(normalized as Plan) ? (normalized as Plan) : null;
};

export default function CheckoutPage() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [plan, setPlan] = useState<Plan>("starter");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const nextPlan = normalizePlan(searchParams.get("plan"));
    if (nextPlan) {
      setPlan(nextPlan);
    }
  }, [searchParams]);

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
          plan,
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
          <label className="block text-sm">
            <span className="text-slate-600">Plan</span>
            <select
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2"
              value={plan}
              onChange={(event) => setPlan(event.target.value as Plan)}
            >
              {planOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
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

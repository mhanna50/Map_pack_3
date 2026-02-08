"use client";

import { useEffect, useMemo, useState } from "react";
import { getAccessToken } from "@/lib/supabase/session";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
const CLIENT_APP_URL = process.env.NEXT_PUBLIC_CLIENT_APP_URL ?? "";
const DEV_BYPASS = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_DISABLE_AUTH === "true";

type Organization = {
  id: string;
  name: string;
  org_type: string;
  slug?: string | null;
  plan_tier?: string | null;
  created_at?: string | null;
  locationCount?: number;
};

const planOptions = ["starter", "pro", "agency"];
const mockOrganizations: Organization[] = [
  {
    id: "org-acme",
    name: "Acme HVAC",
    org_type: "agency",
    plan_tier: "pro",
    created_at: "2025-11-18T12:00:00Z",
    locationCount: 3,
  },
  {
    id: "org-north",
    name: "Northside Plumbing",
    org_type: "local",
    plan_tier: "starter",
    created_at: "2025-12-02T12:00:00Z",
    locationCount: 1,
  },
  {
    id: "org-primetime",
    name: "Primetime Roofing",
    org_type: "agency",
    plan_tier: "agency",
    created_at: "2026-01-09T12:00:00Z",
    locationCount: 8,
  },
];

export default function AdminDashboardPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [planDrafts, setPlanDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [checkoutEmail, setCheckoutEmail] = useState("");
  const [checkoutCompany, setCheckoutCompany] = useState("");
  const [checkoutPlan, setCheckoutPlan] = useState(planOptions[0]);
  const [sendingCheckout, setSendingCheckout] = useState(false);
  const [checkoutMessage, setCheckoutMessage] = useState<string | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);

  useEffect(() => {
    void loadOrganizations();
  }, []);

  const ensureAdminToken = async () => {
    if (DEV_BYPASS) {
      return null;
    }
    const token = await getAccessToken();
    if (!token) {
      throw new Error("You must be signed in to access the admin dashboard.");
    }
    const profileResponse = await fetch(`${API_BASE_URL}/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!profileResponse.ok) {
      throw new Error("Unable to verify admin access.");
    }
    const profile = await profileResponse.json();
    if (!profile.is_staff) {
      throw new Error("Admin access required.");
    }
    return token;
  };

  const loadOrganizations = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await ensureAdminToken();
      if (!token) {
        setOrganizations(mockOrganizations);
        return;
      }
      const response = await fetch(`${API_BASE_URL}/orgs/`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        throw new Error("Failed to load organizations");
      }
      const orgs: Organization[] = await response.json();
      const withCounts = await Promise.all(
        orgs.map(async (org) => {
          try {
            const locResp = await fetch(`${API_BASE_URL}/orgs/${org.id}/locations`, {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            });
            const locations = locResp.ok ? await locResp.json() : [];
            return { ...org, locationCount: locations.length };
          } catch {
            return { ...org, locationCount: 0 };
          }
        }),
      );
      setOrganizations(withCounts);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Unable to fetch data");
    } finally {
      setLoading(false);
    }
  };

  const handleSendCheckout = async () => {
    if (!checkoutEmail.trim() || !checkoutCompany.trim()) {
      setCheckoutMessage("Enter a client email and company name.");
      return;
    }
    if (DEV_BYPASS) {
      setCheckoutMessage("Dev mode: checkout link generation is disabled.");
      return;
    }
    setSendingCheckout(true);
    setCheckoutMessage(null);
    setCheckoutUrl(null);
    try {
      const token = await ensureAdminToken();
      const response = await fetch(`${API_BASE_URL}/billing/checkout-link`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: checkoutEmail.trim(),
          company_name: checkoutCompany.trim(),
          plan: checkoutPlan,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.detail || "Unable to send checkout link");
      }
      const payload = await response.json();
      setCheckoutUrl(payload.checkout_url);
      setCheckoutMessage(
        payload.emailed
          ? "Checkout link sent."
          : "Checkout link generated (email not sent — Supabase Auth handles onboarding emails only).",
      );
    } catch (sendError) {
      setCheckoutMessage(sendError instanceof Error ? sendError.message : "Unable to send checkout link");
    } finally {
      setSendingCheckout(false);
    }
  };

  const handlePlanChange = (orgId: string, value: string) => {
    setPlanDrafts((prev) => ({ ...prev, [orgId]: value }));
  };

  const handleSavePlan = async (orgId: string) => {
    const nextPlan = planDrafts[orgId];
    if (!nextPlan) return;
    setSaving((prev) => ({ ...prev, [orgId]: true }));
    try {
      if (DEV_BYPASS) {
        setOrganizations((prev) =>
          prev.map((org) => (org.id === orgId ? { ...org, plan_tier: nextPlan } : org)),
        );
        return;
      }
      const token = await ensureAdminToken();
      const response = await fetch(`${API_BASE_URL}/orgs/${orgId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ plan_tier: nextPlan }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.detail || "Unable to update plan");
      }
      await loadOrganizations();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Plan update failed");
    } finally {
      setSaving((prev) => ({ ...prev, [orgId]: false }));
    }
  };

  const totalLocations = useMemo(
    () => organizations.reduce((sum, org) => sum + (org.locationCount || 0), 0),
    [organizations],
  );

  const planBreakdown = useMemo(() => {
    return organizations.reduce<Record<string, number>>((acc, org) => {
      const key = org.plan_tier || "unassigned";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
  }, [organizations]);

  return (
    <div className="min-h-screen bg-slate-50 px-6 py-10">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-[0.3em] text-primary">Operator tools</p>
          <h1 className="text-3xl font-semibold">Admin control center</h1>
          <p className="text-sm text-slate-600">
            Monitor active clients, review plans, and jump into dashboards when manual help is needed.
          </p>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
            <p className="font-semibold text-slate-900">Reminder</p>
            <p>Protect this page behind your own admin auth or VPN before sharing beyond your team.</p>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-3xl bg-white p-6 shadow-sm">
            <p className="text-xs uppercase tracking-[0.3em] text-primary">Active orgs</p>
            <p className="mt-3 text-3xl font-semibold">{organizations.length}</p>
          </div>
          <div className="rounded-3xl bg-white p-6 shadow-sm">
            <p className="text-xs uppercase tracking-[0.3em] text-primary">Locations managed</p>
            <p className="mt-3 text-3xl font-semibold">{totalLocations}</p>
          </div>
          <div className="rounded-3xl bg-white p-6 shadow-sm">
            <p className="text-xs uppercase tracking-[0.3em] text-primary">Plan breakdown</p>
            <ul className="mt-3 space-y-1 text-sm text-slate-600">
              {Object.entries(planBreakdown).map(([plan, count]) => (
                <li key={plan}>
                  <span className="font-semibold text-slate-900">{plan}</span>: {count}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="rounded-3xl bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">New client checkout</h2>
              <p className="text-sm text-slate-600">Send a Stripe checkout link after closing the deal.</p>
            </div>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <label className="text-sm text-slate-600">
              Client email
              <input
                className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm"
                type="email"
                placeholder="client@company.com"
                value={checkoutEmail}
                onChange={(event) => setCheckoutEmail(event.target.value)}
              />
            </label>
            <label className="text-sm text-slate-600">
              Company name
              <input
                className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm"
                type="text"
                placeholder="Acme HVAC"
                value={checkoutCompany}
                onChange={(event) => setCheckoutCompany(event.target.value)}
              />
            </label>
            <label className="text-sm text-slate-600">
              Plan
              <select
                className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm"
                value={checkoutPlan}
                onChange={(event) => setCheckoutPlan(event.target.value)}
              >
                {planOptions.map((plan) => (
                  <option key={plan} value={plan}>
                    {plan}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              onClick={() => void handleSendCheckout()}
              disabled={sendingCheckout}
            >
              {sendingCheckout ? "Sending..." : "Send checkout link"}
            </button>
            {checkoutUrl && (
              <button
                className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600"
                onClick={() => navigator.clipboard.writeText(checkoutUrl)}
              >
                Copy checkout link
              </button>
            )}
            {checkoutMessage && <p className="text-sm text-slate-600">{checkoutMessage}</p>}
          </div>
        </section>

        <section className="rounded-3xl bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">Organizations</h2>
              <p className="text-sm text-slate-600">Plan tier, locations, and admin shortcuts.</p>
            </div>
            <button
              className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600"
              onClick={() => void loadOrganizations()}
            >
              Refresh
            </button>
          </div>
          {error && <p className="mt-4 text-sm text-rose-600">{error}</p>}
          {loading ? (
            <p className="mt-6 text-sm text-slate-500">Loading organizations…</p>
          ) : (
            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-[0.2em] text-slate-400">
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Plan</th>
                    <th className="px-3 py-2">Locations</th>
                    <th className="px-3 py-2">Created</th>
                    <th className="px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {organizations.map((org) => (
                    <tr key={org.id} className="border-t border-slate-100">
                      <td className="px-3 py-3">
                        <p className="font-semibold text-slate-900">{org.name}</p>
                        <p className="text-xs text-slate-500">{org.org_type.toLowerCase()}</p>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <select
                            className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm"
                            value={planDrafts[org.id] ?? org.plan_tier ?? ""}
                            onChange={(event) => handlePlanChange(org.id, event.target.value)}
                          >
                            <option value="">Unassigned</option>
                            {planOptions.map((plan) => (
                              <option key={plan} value={plan}>
                                {plan}
                              </option>
                            ))}
                          </select>
                          <button
                            className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 disabled:opacity-50"
                            onClick={() => void handleSavePlan(org.id)}
                            disabled={saving[org.id] || !planDrafts[org.id] || planDrafts[org.id] === org.plan_tier}
                          >
                            {saving[org.id] ? "Saving…" : "Save"}
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-slate-600">{org.locationCount ?? 0}</td>
                      <td className="px-3 py-3 text-slate-500">
                        {org.created_at ? new Date(org.created_at).toLocaleDateString() : "—"}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-2 text-xs font-semibold">
                          <a
                            href={`${CLIENT_APP_URL || ""}/app?org=${org.id}`}
                            className="rounded-full border border-slate-200 px-3 py-1 text-slate-600"
                          >
                            Open dashboard
                          </a>
                          <button
                            className="rounded-full border border-slate-200 px-3 py-1 text-slate-600"
                            onClick={() => navigator.clipboard.writeText(org.id)}
                          >
                            Copy org ID
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

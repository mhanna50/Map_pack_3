"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

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

export default function AdminDashboardPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [planDrafts, setPlanDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  useEffect(() => {
    void loadOrganizations();
  }, []);

  const loadOrganizations = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/orgs/`);
      if (!response.ok) {
        throw new Error("Failed to load organizations");
      }
      const orgs: Organization[] = await response.json();
      const withCounts = await Promise.all(
        orgs.map(async (org) => {
          try {
            const locResp = await fetch(`${API_BASE_URL}/orgs/${org.id}/locations`);
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

  const handlePlanChange = (orgId: string, value: string) => {
    setPlanDrafts((prev) => ({ ...prev, [orgId]: value }));
  };

  const handleSavePlan = async (orgId: string) => {
    const nextPlan = planDrafts[orgId];
    if (!nextPlan) return;
    setSaving((prev) => ({ ...prev, [orgId]: true }));
    try {
      const response = await fetch(`${API_BASE_URL}/orgs/${orgId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
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
                          <Link href={`/app?org=${org.id}`} className="rounded-full border border-slate-200 px-3 py-1 text-slate-600">
                            Open dashboard
                          </Link>
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

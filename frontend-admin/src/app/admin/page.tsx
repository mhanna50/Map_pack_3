"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { AdminShell } from "@/features/admin/components/shell";
import { adminApi } from "@/features/admin/adminApiClient";
import { AdminActivityTimeline, AdminFilterBar, AdminFilters, AdminIssueList, AdminModuleTable, AdminStatCard, statusBadge } from "@/features/admin/components/monitoring";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

type OverviewPayload = {
  stats?: Record<string, number | string | null>;
  module_health?: Array<Record<string, unknown>>;
  recent_activity?: Array<Record<string, unknown>>;
  attention?: Array<Record<string, unknown>>;
};

export default function AdminOverviewPage() {
  const [filters, setFilters] = useState<AdminFilters>({ range: "30d" });
  const [data, setData] = useState<OverviewPayload | null>(null);
  const [clients, setClients] = useState<Array<{ tenant_id?: string; business_name?: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [overview, clientRows] = await Promise.all([
          adminApi.monitoringOverview(filters),
          adminApi.monitoringClients({ range: filters.range }),
        ]);
        if (!active) return;
        setData(overview as OverviewPayload);
        setClients((clientRows.rows ?? []) as Array<{ tenant_id?: string; business_name?: string }>);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Unable to load monitoring overview");
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [filters, refreshKey]);

  const statCards = useMemo(
    () => {
      const stats = data?.stats ?? {};
      return [
        ["Total clients", stats.total_clients, "Across selected filters"],
        ["Active clients", stats.active_clients, "Subscription/account active"],
        ["Still onboarding", stats.onboarding_clients, "Pending setup"],
        ["Incomplete setup", stats.incomplete_setup_clients, "Missing required module setup"],
        ["Failed integrations", stats.failed_integrations_clients, "Billing or integration failures"],
        ["Need attention", stats.attention_clients, "Prioritized issues"],
        ["Recent posts", stats.recent_posts, "Selected date range"],
        ["Review requests", stats.recent_review_requests, "Selected date range"],
        ["Recovered leads", stats.recent_leads, "Lead Recovery"],
        ["Owner notifications", stats.recent_owner_notifications, "Lead Recovery"],
        ["Failed jobs", stats.failed_jobs, "Background jobs"],
        ["Open alerts", stats.open_alerts, "Operational alerts"],
      ];
    },
    [data?.stats],
  );

  return (
    <AdminShell>
      <div className="space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Admin Monitoring</p>
            <h1 className="text-2xl font-semibold">Platform overview</h1>
            <p className="text-sm text-muted-foreground">Client activity, module health, setup gaps, and attention signals.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setRefreshKey((key) => key + 1)}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </header>

        <AdminFilterBar filters={filters} onChange={setFilters} clients={clients} showModule showStatus modules={(data?.module_health ?? []).map((row) => ({ id: String(row.id), label: String(row.label) }))} />

        {error ? (
          <EmptyState inline title="Could not load monitoring data" description={error} />
        ) : loading ? (
          <Skeleton className="h-96 w-full" />
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {statCards.map(([label, value, description]) => (
                <AdminStatCard key={String(label)} label={String(label)} value={value} description={String(description)} tone={Number(value ?? 0) > 0 && String(label).includes("Failed") ? "danger" : "default"} />
              ))}
            </div>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
              <Card>
                <CardHeader className="flex flex-col items-start justify-between sm:flex-row sm:items-center">
                  <div>
                    <CardTitle>Module health</CardTitle>
                    <CardDescription>Reusable status model across all client dashboard tabs</CardDescription>
                  </div>
                  <Link className="rounded-lg border border-border bg-white px-3 py-2 text-xs font-semibold hover:bg-accent" href="/admin/module-health">
                    Open module health
                  </Link>
                </CardHeader>
                <CardContent>
                  <AdminModuleTable
                    rows={data?.module_health ?? []}
                    columns={[
                      { key: "label", label: "Module" },
                      { key: "status", label: "Status", render: (row) => statusBadge(row.status) },
                      { key: "active_clients", label: "Active" },
                      { key: "inactive_clients", label: "Inactive" },
                      { key: "activity_count", label: "Activity" },
                      { key: "issue_count", label: "Issues" },
                    ]}
                    actions={(row) => <Link className="text-sm font-medium text-primary" href={`/admin/modules/${String(row.id).replaceAll("_", "-")}`}>Inspect</Link>}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Attention needed</CardTitle>
                  <CardDescription>Critical and warning signals by client/module</CardDescription>
                </CardHeader>
                <CardContent>
                  <AdminIssueList issues={data?.attention ?? []} />
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Recent activity</CardTitle>
                <CardDescription>Normalized activity adapter for current and future modules</CardDescription>
              </CardHeader>
              <CardContent>
                {(data?.recent_activity ?? []).length ? <AdminActivityTimeline rows={data?.recent_activity ?? []} /> : <EmptyState inline title="No recent activity events" />}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AdminShell>
  );
}

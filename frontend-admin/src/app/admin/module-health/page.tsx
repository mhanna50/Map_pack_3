"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AdminShell } from "@/features/admin/components/shell";
import { adminApi } from "@/features/admin/adminApiClient";
import { AdminFilterBar, AdminFilters, AdminModuleTable, AdminStatCard, statusBadge } from "@/features/admin/components/monitoring";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminModuleHealthPage() {
  const [filters, setFilters] = useState<AdminFilters>({ range: "30d" });
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [clients, setClients] = useState<Array<{ tenant_id?: string; business_name?: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [health, clientRows] = await Promise.all([
          adminApi.monitoringModuleHealth(filters),
          adminApi.monitoringClients({ range: filters.range }),
        ]);
        if (!active) return;
        setRows((health.rows ?? []) as Array<Record<string, unknown>>);
        setClients((clientRows.rows ?? []) as Array<{ tenant_id?: string; business_name?: string }>);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Unable to load module health");
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [filters]);

  const totalIssues = rows.reduce((sum, row) => sum + Number(row.issue_count ?? 0), 0);
  const activeModules = rows.filter((row) => row.status === "healthy").length;

  return (
    <AdminShell>
      <div className="space-y-5">
        <header>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Monitoring</p>
          <h1 className="text-2xl font-semibold">Module Health</h1>
          <p className="text-sm text-muted-foreground">Reusable status, setup, activity, and issue tracking for every client dashboard module.</p>
        </header>
        <AdminFilterBar filters={filters} onChange={setFilters} clients={clients} showStatus />
        {error ? (
          <EmptyState inline title="Could not load module health" description={error} />
        ) : loading ? (
          <Skeleton className="h-96 w-full" />
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <AdminStatCard label="Tracked modules" value={rows.length} />
              <AdminStatCard label="Healthy modules" value={activeModules} tone="success" />
              <AdminStatCard label="Open module issues" value={totalIssues} tone={totalIssues ? "warning" : "default"} />
            </div>
            <Card>
              <CardHeader>
                <CardTitle>Module matrix</CardTitle>
                <CardDescription>Inspect each module or deep link into a client tab from module pages.</CardDescription>
              </CardHeader>
              <CardContent>
                <AdminModuleTable
                  rows={rows}
                  columns={[
                    { key: "label", label: "Module" },
                    { key: "status", label: "Status", render: (row) => statusBadge(row.status) },
                    { key: "active_clients", label: "Active clients" },
                    { key: "inactive_clients", label: "Inactive clients" },
                    { key: "activity_count", label: "Activity" },
                    { key: "issue_count", label: "Issues" },
                  ]}
                  actions={(row) => <Link className="text-sm font-medium text-primary" href={`/admin/modules/${String(row.id).replaceAll("_", "-")}`}>View</Link>}
                />
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AdminShell>
  );
}

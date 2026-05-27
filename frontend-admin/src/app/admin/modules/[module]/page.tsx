"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { AdminShell } from "@/features/admin/components/shell";
import { adminApi } from "@/features/admin/adminApiClient";
import { AdminFilterBar, AdminFilters, AdminModuleTable, AdminStatCard, statusBadge } from "@/features/admin/components/monitoring";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/date-utils";

const moduleTitles: Record<string, string> = {
  "gbp-posting": "GBP Posting",
  "gbp-audits": "GBP Audits",
  reviews: "Reviews",
  citations: "Citations",
  visibility: "Visibility",
  images: "Images",
  qa: "Q&A",
  "website-audits": "Website Audits",
};

export default function AdminGenericModulePage() {
  const params = useParams<{ module: string }>();
  const moduleId = params.module;
  const title = moduleTitles[moduleId] ?? moduleId.replaceAll("-", " ");
  const [filters, setFilters] = useState<AdminFilters>({ range: "30d" });
  const [stats, setStats] = useState<Record<string, unknown>>({});
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
        const [moduleData, clientRows] = await Promise.all([
          adminApi.monitoringModule(moduleId, filters),
          adminApi.monitoringClients({ range: filters.range }),
        ]);
        if (!active) return;
        setStats((moduleData.stats ?? {}) as Record<string, unknown>);
        setRows((moduleData.rows ?? []) as Array<Record<string, unknown>>);
        setClients((clientRows.rows ?? []) as Array<{ tenant_id?: string; business_name?: string }>);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : `Unable to load ${title}`);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [moduleId, filters, title]);

  const columns = useMemo(
    () => [
      { key: "tenant_id", label: "Client/Tenant" },
      { key: "status", label: "Status", render: (row: Record<string, unknown>) => statusBadge(row.status) },
      { key: "title", label: "Title" },
      { key: "name", label: "Name" },
      { key: "created_at", label: "Created", render: (row: Record<string, unknown>) => formatDate(String(row.created_at ?? row.published_at ?? row.audited_at ?? "")) },
    ],
    [],
  );

  return (
    <AdminShell>
      <div className="space-y-5">
        <header>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Module monitoring</p>
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="text-sm text-muted-foreground">Reusable monitoring adapter for setup, activity, failures, and client deep links.</p>
        </header>
        <AdminFilterBar filters={filters} onChange={setFilters} clients={clients} showStatus />
        {error ? (
          <EmptyState inline title={`Could not load ${title}`} description={error} />
        ) : loading ? (
          <Skeleton className="h-96 w-full" />
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <AdminStatCard label="Total records" value={stats.total ?? rows.length} />
              <AdminStatCard label="Failed/error" value={stats.failed ?? 0} tone={Number(stats.failed ?? 0) ? "danger" : "default"} />
              <AdminStatCard label="Active clients" value={stats.active_clients ?? 0} />
            </div>
            <Card>
              <CardHeader>
                <CardTitle>{title} records</CardTitle>
                <CardDescription>First 100 records for the selected filters</CardDescription>
              </CardHeader>
              <CardContent>
                <AdminModuleTable rows={rows} columns={columns} />
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AdminShell>
  );
}

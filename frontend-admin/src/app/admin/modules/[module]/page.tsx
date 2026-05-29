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
  visibility: "Rank Tracking",
  images: "Images",
  qa: "Q&A",
  "website-audits": "Website Audits",
};

const moduleDescriptions: Record<string, string> = {
  reviews:
    "Reviews covers two separate workflows: review requests you send to customers, and gathered reviews imported or pulled from Google and other sources.",
};

export default function AdminGenericModulePage() {
  const params = useParams<{ module: string }>();
  const moduleId = params.module;
  const title = moduleTitles[moduleId] ?? moduleId.replaceAll("-", " ");
  const description =
    moduleDescriptions[moduleId] ?? "Reusable monitoring adapter for setup, activity, failures, and client deep links.";
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
    () => {
      const baseColumns = [
        { key: "tenant_id", label: "Client/Tenant" },
        { key: "status", label: "Status", render: (row: Record<string, unknown>) => statusBadge(row.status) },
        { key: "title", label: "Title" },
        { key: "name", label: "Name" },
        { key: "created_at", label: "Created", render: (row: Record<string, unknown>) => formatDate(String(row.created_at ?? row.published_at ?? row.audited_at ?? "")) },
      ];
      if (moduleId !== "reviews") return baseColumns;
      return [
        { key: "record_type", label: "Workflow" },
        { key: "source_display", label: "Source/channel" },
        ...baseColumns,
      ];
    },
    [moduleId],
  );

  return (
    <AdminShell>
      <div className="space-y-5">
        <header>
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </header>
        {moduleId === "reviews" && (
          <div className="grid gap-3 md:grid-cols-2">
            <Card>
              <CardContent className="px-5 pb-5 pt-6 sm:pt-6">
                <p className="text-sm font-semibold">Review requests</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Outbound customer asks sent by SMS, email, or other request workflows.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="px-5 pb-5 pt-6 sm:pt-6">
                <p className="text-sm font-semibold">Gathered reviews</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Reviews pulled or normalized from Google and additional review sources.
                </p>
              </CardContent>
            </Card>
          </div>
        )}
        <AdminFilterBar filters={filters} onChange={setFilters} clients={clients} showStatus />
        {error ? (
          <EmptyState inline title={`Could not load ${title}`} description={error} />
        ) : loading ? (
          <Skeleton className="h-96 w-full" />
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              {moduleId === "reviews" ? (
                <>
                  <AdminStatCard label="Review requests" value={stats.review_requests ?? 0} description="Outbound customer requests" />
                  <AdminStatCard label="Gathered reviews" value={stats.gathered_reviews ?? 0} description="Pulled from review sources" />
                  <AdminStatCard label="Failed/error" value={stats.failed ?? 0} tone={Number(stats.failed ?? 0) ? "danger" : "default"} />
                </>
              ) : (
                <>
                  <AdminStatCard label="Total records" value={stats.total ?? rows.length} />
                  <AdminStatCard label="Failed/error" value={stats.failed ?? 0} tone={Number(stats.failed ?? 0) ? "danger" : "default"} />
                  <AdminStatCard label="Active clients" value={stats.active_clients ?? 0} />
                </>
              )}
            </div>
            <Card>
              <CardHeader>
                <CardTitle>{title} records</CardTitle>
                <CardDescription>
                  {moduleId === "reviews"
                    ? "Review request records and gathered review records for the selected filters"
                    : "First 100 records for the selected filters"}
                </CardDescription>
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

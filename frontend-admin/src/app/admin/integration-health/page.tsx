"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { AdminShell } from "@/features/admin/components/shell";
import { adminApi } from "@/features/admin/adminApiClient";
import { AdminFilterBar, AdminFilters, AdminModuleTable, AdminStatCard, statusBadge } from "@/features/admin/components/monitoring";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/date-utils";

const modules = [
  { id: "gbp", label: "Google Business Profile" },
  { id: "gbp_posts", label: "GBP Posts" },
  { id: "lead_recovery_sms", label: "Lead Recovery SMS" },
  { id: "lead_recovery_webhooks", label: "Lead Recovery Webhooks" },
  { id: "billing_webhooks", label: "Stripe Webhooks" },
  { id: "platform_config", label: "Platform Config" },
  { id: "celery", label: "Celery / Queue" },
];

export default function AdminIntegrationHealthPage() {
  const [filters, setFilters] = useState<AdminFilters>({ range: "30d" });
  const [payload, setPayload] = useState<Record<string, unknown> | null>(null);
  const [incidentDetail, setIncidentDetail] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await adminApi.integrationHealth(filters);
        if (active) setPayload(data);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Unable to load integration health");
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [filters, refreshKey]);

  const stats = useMemo(() => (payload?.stats ?? {}) as Record<string, unknown>, [payload]);
  const health = useMemo(() => (payload?.health ?? []) as Array<Record<string, unknown>>, [payload]);
  const incidents = useMemo(() => (payload?.incidents ?? []) as Array<Record<string, unknown>>, [payload]);
  const attempts = useMemo(() => (payload?.recovery_attempts ?? []) as Array<Record<string, unknown>>, [payload]);
  const prompts = useMemo(() => (payload?.prompts ?? []) as Array<Record<string, unknown>>, [payload]);
  const clients = useMemo(() => {
    const seen = new Map<string, { tenant_id: string; business_name: string }>();
    [...health, ...incidents, ...prompts].forEach((row) => {
      const tenantId = String(row.tenant_id ?? "");
      if (tenantId && !seen.has(tenantId)) seen.set(tenantId, { tenant_id: tenantId, business_name: String(row.client ?? tenantId) });
    });
    return [...seen.values()];
  }, [health, incidents, prompts]);

  const openIncident = async (id: unknown) => {
    if (!id) return;
    setIncidentDetail(await adminApi.integrationIncident(String(id)));
  };

  return (
    <AdminShell>
      <div className="space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Integration Health & Recovery</p>
            <h1 className="text-2xl font-semibold">Integration Health</h1>
            <p className="text-sm text-muted-foreground">Sanitized incidents, recovery attempts, reconnect prompts, and queue health.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setRefreshKey((key) => key + 1)}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </header>

        <AdminFilterBar filters={filters} onChange={setFilters} clients={clients} modules={modules} showModule showStatus />

        {error ? (
          <EmptyState inline title="Could not load integration health" description={error} />
        ) : loading ? (
          <Skeleton className="h-96 w-full" />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <AdminStatCard density="compact" label="Overall health" value={stats.overall_status ?? "healthy"} tone={stats.overall_status === "critical" ? "danger" : stats.overall_status === "warning" ? "warning" : "success"} />
              <AdminStatCard density="compact" label="Critical incidents" value={stats.active_critical_incidents} tone={Number(stats.active_critical_incidents ?? 0) ? "danger" : "default"} />
              <AdminStatCard density="compact" label="Warnings" value={stats.active_warning_incidents} tone={Number(stats.active_warning_incidents ?? 0) ? "warning" : "default"} />
              <AdminStatCard density="compact" label="Reconnect needed" value={stats.clients_needing_reconnect} tone={Number(stats.clients_needing_reconnect ?? 0) ? "warning" : "default"} />
              <AdminStatCard density="compact" label="Health checks" value={stats.health_checks} />
              <AdminStatCard density="compact" label="Failing integrations" value={stats.failing_integrations} tone={Number(stats.failing_integrations ?? 0) ? "danger" : "default"} />
              <AdminStatCard density="compact" label="Degraded integrations" value={stats.degraded_integrations} tone={Number(stats.degraded_integrations ?? 0) ? "warning" : "default"} />
              <AdminStatCard density="compact" label="Recovered incidents" value={stats.recovered_incidents} tone="success" />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Active incidents</CardTitle>
                <CardDescription>Repeated failures are deduplicated into the same open incident.</CardDescription>
              </CardHeader>
              <CardContent>
                <AdminModuleTable
                  rows={incidents}
                  columns={[
                    { key: "severity", label: "Severity", render: (row) => <Badge variant={row.severity === "critical" ? "danger" : row.severity === "warning" ? "warning" : "muted"}>{String(row.severity ?? "info")}</Badge> },
                    { key: "integration", label: "Integration" },
                    { key: "module", label: "Module" },
                    { key: "client", label: "Client" },
                    { key: "status", label: "Status", render: (row) => statusBadge(row.status) },
                    { key: "category", label: "Category" },
                    { key: "title", label: "Issue" },
                    { key: "last_seen_at", label: "Last seen", render: (row) => formatDate(String(row.last_seen_at ?? row.created_at ?? "")) },
                  ]}
                  actions={(row) => <Button size="sm" variant="outline" onClick={() => openIncident(row.id)}>Details</Button>}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Integration status</CardTitle>
                <CardDescription>Current status by integration, module, and client.</CardDescription>
              </CardHeader>
              <CardContent>
                <AdminModuleTable
                  rows={health}
                  columns={[
                    { key: "severity", label: "Severity" },
                    { key: "integration", label: "Integration" },
                    { key: "module", label: "Module" },
                    { key: "client", label: "Client" },
                    { key: "status", label: "Status", render: (row) => statusBadge(row.status) },
                    { key: "category", label: "Category" },
                    { key: "message", label: "Message" },
                    { key: "last_failure_at", label: "Last failure", render: (row) => formatDate(String(row.last_failure_at ?? row.last_checked_at ?? "")) },
                    { key: "recovery_attempt_count", label: "Recovery attempts" },
                    { key: "is_user_action_required", label: "User action", render: (row) => row.is_user_action_required ? "Yes" : "No" },
                    { key: "admin_action_required", label: "Admin action", render: (row) => row.admin_action_required ? "Yes" : "No" },
                  ]}
                />
              </CardContent>
            </Card>

            <div className="grid gap-5 xl:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Recent recovery attempts</CardTitle>
                  <CardDescription>Token refreshes, manual retries, and automatic recovery events.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {attempts.length ? attempts.slice(0, 20).map((row) => (
                    <div key={String(row.id)} className="rounded-lg border border-border p-3 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium">{String(row.action ?? "recovery")}</p>
                        {statusBadge(row.status)}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{String(row.client ?? "Platform-wide")} · {String(row.integration ?? "")} · {formatDate(String(row.created_at ?? ""))}</p>
                      {row.message ? <p className="mt-2 text-muted-foreground">{String(row.message)}</p> : null}
                    </div>
                  )) : <EmptyState inline title="No recovery attempts" />}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Clients needing reconnect</CardTitle>
                  <CardDescription>Client-facing prompts that use the Google OAuth onboarding flow.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {prompts.length ? prompts.map((row) => (
                    <div key={String(row.id)} className="rounded-lg border border-border p-3 text-sm">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-600" />
                        <p className="font-medium">{String(row.client ?? "Client")}</p>
                      </div>
                      <p className="mt-1 text-muted-foreground">{String(row.reason ?? "")}</p>
                    </div>
                  )) : <EmptyState inline title="No reconnect prompts" />}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>

      <Sheet open={Boolean(incidentDetail)} onOpenChange={(open) => !open && setIncidentDetail(null)} title="Incident detail" description="Sanitized provider error and recovery timeline">
        {incidentDetail ? <IncidentDetail data={incidentDetail} /> : null}
      </Sheet>
    </AdminShell>
  );
}

function IncidentDetail({ data }: { data: Record<string, unknown> }) {
  const incident = (data.incident ?? {}) as Record<string, unknown>;
  const attempts = (data.recovery_attempts ?? []) as Array<Record<string, unknown>>;
  const client = (data.client ?? {}) as Record<string, unknown>;
  return (
    <div className="space-y-4 text-sm">
      <div>
        <p className="text-lg font-semibold">{String(incident.title ?? "Incident")}</p>
        <p className="text-muted-foreground">{String(client.business_name ?? incident.tenant_id ?? "Platform-wide")}</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {["integration", "module", "category", "severity", "status", "safe_error_summary"].map((key) => (
          <div key={key} className="rounded-lg border border-border p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{key.replaceAll("_", " ")}</p>
            <p className="mt-1 break-words">{String(incident[key] ?? "-")}</p>
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-border p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sanitized details</p>
        <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded bg-muted p-3 text-xs">{JSON.stringify(incident.safe_details ?? {}, null, 2)}</pre>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recovery timeline</p>
        <div className="mt-2 space-y-2">
          {attempts.length ? attempts.map((row) => (
            <div key={String(row.id)} className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between">
                <p className="font-medium">{String(row.action ?? "attempt")}</p>
                {statusBadge(row.status)}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{formatDate(String(row.created_at ?? ""))}</p>
              {row.message ? <p className="mt-2 text-muted-foreground">{String(row.message)}</p> : null}
            </div>
          )) : <p className="text-muted-foreground">No recovery attempts recorded.</p>}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AdminShell } from "@/features/admin/components/shell";
import { adminApi } from "@/features/admin/adminApiClient";
import { AdminActivityTimeline, AdminIssueList, AdminModuleTable, AdminStatCard, statusBadge } from "@/features/admin/components/monitoring";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminClientMonitorPage() {
  const params = useParams<{ id: string }>();
  const tenantId = params.id;
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await adminApi.monitoringClient(tenantId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load client monitor");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    load();
  }, [load]);

  const tenant = (data?.tenant ?? {}) as Record<string, unknown>;
  const stats = (data?.stats ?? {}) as Record<string, unknown>;
  const modules = (data?.module_health ?? []) as Array<Record<string, unknown>>;
  const activity = (data?.recent_activity ?? []) as Array<Record<string, unknown>>;
  const attention = (data?.attention ?? []) as Array<Record<string, unknown>>;
  const notes = (data?.notes ?? []) as Array<Record<string, unknown>>;

  const addNote = async () => {
    if (!note.trim()) return;
    await adminApi.addClientNote(tenantId, note.trim());
    setNote("");
    await load();
  };

  const openAsClient = async (targetPath: string) => {
    const result = await adminApi.impersonateDeepLink(tenantId, targetPath, "client_monitor");
    const clientBase = (process.env.NEXT_PUBLIC_CLIENT_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
    window.open(`${clientBase}${result.targetPath}`, "_blank", "noopener,noreferrer");
  };

  return (
    <AdminShell>
      <div className="space-y-5">
        {error ? (
          <EmptyState inline title="Could not load client monitor" description={error} />
        ) : loading ? (
          <Skeleton className="h-96 w-full" />
        ) : (
          <>
            <header className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Client monitor</p>
                <h1 className="text-2xl font-semibold">{String(tenant.business_name ?? "Client")}</h1>
                <p className="text-sm text-muted-foreground">{tenantId}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => openAsClient("/dashboard")}>Open as client</Button>
                <Button onClick={() => openAsClient("/dashboard/lead-recovery")}>Open Lead Recovery tab</Button>
              </div>
            </header>

            <div className="grid gap-4 md:grid-cols-4">
              <AdminStatCard label="Recent posts" value={stats.recent_posts} />
              <AdminStatCard label="Review requests" value={stats.recent_review_requests} />
              <AdminStatCard label="Recovered leads" value={stats.recent_leads} />
              <AdminStatCard label="Open issues" value={attention.length} tone={attention.length ? "warning" : "default"} />
            </div>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="space-y-5">
                <Card>
                  <CardHeader>
                    <CardTitle>Client summary</CardTitle>
                    <CardDescription>Plan, onboarding, integrations, modules, activity, and issues</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3 md:grid-cols-2">
                    <Info label="Subscription" value={String(tenant.status ?? "unknown")} />
                    <Info label="Plan" value={String(tenant.plan ?? "-")} />
                    <Info label="Last activity" value={String(tenant.last_activity ?? tenant.updated_at ?? "-")} />
                    <Info label="Tenant id" value={tenantId} />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Module cards</CardTitle>
                    <CardDescription>Enabled status, setup status, activity count, errors, and quick inspect actions</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <AdminModuleTable
                      rows={modules}
                      columns={[
                        { key: "label", label: "Module" },
                        { key: "status", label: "Status", render: (row) => statusBadge(row.status) },
                        { key: "activity_count", label: "Activity" },
                        { key: "issue_count", label: "Errors/issues" },
                        { key: "client_path", label: "Client tab" },
                      ]}
                      actions={(row) => <Button size="sm" variant="outline" onClick={() => openAsClient(String(row.client_path ?? "/dashboard"))}>Open tab</Button>}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Recent activity timeline</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {activity.length ? <AdminActivityTimeline rows={activity} /> : <EmptyState inline title="No activity events" />}
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-5">
                <Card>
                  <CardHeader>
                    <CardTitle>Attention needed</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <AdminIssueList issues={attention} />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Admin notes</CardTitle>
                    <CardDescription>Internal notes for this client</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <textarea value={note} onChange={(event) => setNote(event.target.value)} className="min-h-24 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm" />
                    <Button onClick={addNote} className="w-full">Add note</Button>
                    <div className="space-y-2">
                      {notes.map((item) => (
                        <div key={String(item.id)} className="rounded-lg border border-border bg-white/70 p-3 text-sm">
                          <p>{String(item.note ?? "")}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{String(item.created_at ?? "")}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </>
        )}
      </div>
    </AdminShell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 break-all font-medium">{value}</p>
    </div>
  );
}

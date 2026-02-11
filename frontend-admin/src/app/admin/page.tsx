"use client";

import { useEffect, useState } from "react";
import { Activity, AlertTriangle, BarChart3, HeartPulse, ShieldCheck } from "lucide-react";
import { AdminShell } from "@/components/admin/shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { adminApi } from "@/lib/adminApiClient";
import { timeAgo } from "@/lib/date-utils";

type Kpis = {
  activeTenants: number;
  churned30d: number;
  posts30d: number;
  reviews30d: number;
  failedJobs: number;
  mrr?: number | null;
  trend?: number | null;
};

type AuditEntry = {
  id?: string;
  event_type?: string;
  created_at?: string;
};

export default function AdminOverviewPage() {
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [kpiData, auditData] = await Promise.all([adminApi.kpis(), adminApi.audit({ page: 1, pageSize: 10 })]);
        if (!active) return;
        setKpis(kpiData);
        setAudit(auditData.rows ?? []);
      } catch (err: unknown) {
        if (!active) return;
        const message = err instanceof Error ? err.message : "Unable to load overview";
        setError(message);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    const interval = setInterval(load, 120_000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [refreshKey]);

  const handleRefresh = () => setRefreshKey((k) => k + 1);

  const kpiCards = [
    { label: "Active tenants", value: kpis?.activeTenants ?? "—", icon: ShieldCheck },
    { label: "Churned (30d)", value: kpis?.churned30d ?? "—", icon: AlertTriangle },
    { label: "Posts (30d)", value: kpis?.posts30d ?? "—", icon: Activity },
    { label: "Review requests (30d)", value: kpis?.reviews30d ?? "—", icon: BarChart3 },
    { label: "Failed jobs", value: kpis?.failedJobs ?? "—", icon: HeartPulse },
    { label: "MRR (placeholder)", value: kpis?.mrr ? `$${kpis.mrr}` : "—", icon: BarChart3 },
  ];

  return (
    <AdminShell onSearch={() => {}}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Owner control</p>
            <h1 className="text-2xl font-semibold">Platform overview</h1>
            <p className="text-sm text-muted-foreground">Monitor tenants, health, and admin actions.</p>
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            Refresh
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {kpiCards.map((kpi) => {
            const Icon = kpi.icon;
            return (
              <Card key={kpi.label}>
                <CardContent className="flex items-center justify-between gap-3 p-5">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">{kpi.label}</p>
                    <div className="mt-2 text-2xl font-semibold">
                      {loading ? <Skeleton className="h-6 w-16" /> : kpi.value}
                    </div>
                  </div>
                  <Icon className="h-5 w-5 text-primary" />
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>System health</CardTitle>
                <CardDescription>Lightweight polling every 120s</CardDescription>
              </div>
              <Badge variant="success">Healthy</Badge>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2 text-sm">
              <HealthRow label="Stripe webhooks" value="OK (placeholder)" />
              <HealthRow label="GBP tokens" value="OK (placeholder)" />
              <HealthRow label="Scheduler" value="Running" />
              <HealthRow label="Error rate (24h)" value="Low" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent admin actions</CardTitle>
              <CardDescription>Audit log</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-32 w-full" />
              ) : audit.length === 0 ? (
                <EmptyState inline title="No admin actions yet" />
              ) : (
                <div className="space-y-2 text-sm">
                  {audit.map((item) => (
                    <div key={item.id ?? item.created_at} className="rounded-lg border border-border bg-white/60 px-3 py-2">
                      <p className="font-semibold">{item.event_type ?? "action"}</p>
                      <p className="text-xs text-muted-foreground">{timeAgo(item.created_at)}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {error && <p className="text-sm text-rose-600">Error: {error}</p>}
      </div>
    </AdminShell>
  );
}

function HealthRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-white/60 px-3 py-2">
      <span>{label}</span>
      <span className="font-semibold text-foreground">{value}</span>
    </div>
  );
}

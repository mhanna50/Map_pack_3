"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, BarChart3, HeartPulse, ShieldCheck } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
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
        const [kpiData, auditData] = await Promise.all([adminApi.kpis(), adminApi.audit({ page: 1, pageSize: 80 })]);
        if (!active) return;
        setKpis(kpiData);
        setAudit((auditData.rows ?? []) as AuditEntry[]);
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

  const comparisonData = useMemo(
    () => [
      { label: "Posts", value: kpis?.posts30d ?? 0, color: "var(--chart-1)" },
      { label: "Reviews", value: kpis?.reviews30d ?? 0, color: "var(--chart-2)" },
      { label: "Failed jobs", value: kpis?.failedJobs ?? 0, color: "var(--chart-5)" },
      { label: "Churned", value: kpis?.churned30d ?? 0, color: "var(--chart-4)" },
    ],
    [kpis],
  );

  const tenantDistribution = useMemo(
    () => [
      { name: "Active", value: kpis?.activeTenants ?? 0, color: "var(--chart-2)" },
      { name: "Churned (30d)", value: kpis?.churned30d ?? 0, color: "var(--chart-4)" },
      { name: "Failed jobs", value: kpis?.failedJobs ?? 0, color: "var(--chart-5)" },
    ],
    [kpis],
  );

  const auditTimeline = useMemo(() => {
    const days = 7;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (days - 1));

    const buckets = Array.from({ length: days }, (_, index) => {
      const day = new Date(start);
      day.setDate(start.getDate() + index);
      const key = day.toISOString().slice(0, 10);
      return { key, label: day.toLocaleDateString(undefined, { month: "short", day: "numeric" }), actions: 0 };
    });
    const byDay = new Map(buckets.map((bucket) => [bucket.key, bucket]));

    for (const entry of audit) {
      if (!entry.created_at) continue;
      const key = new Date(entry.created_at).toISOString().slice(0, 10);
      const bucket = byDay.get(key);
      if (bucket) bucket.actions += 1;
    }
    return buckets;
  }, [audit]);

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
            <CardHeader>
              <CardTitle>Activity comparison</CardTitle>
              <CardDescription>Last 30 days across core platform metrics</CardDescription>
            </CardHeader>
            <CardContent className="h-[280px]">
              {loading ? (
                <Skeleton className="h-full w-full" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={comparisonData} margin={{ top: 8, right: 12, left: -24, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 12,
                        border: "1px solid var(--border)",
                        background: "var(--card)",
                      }}
                    />
                    <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                      {comparisonData.map((entry) => (
                        <Cell key={entry.label} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Status distribution</CardTitle>
              <CardDescription>Tenant health and failures</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {loading ? (
                <Skeleton className="h-36 w-full" />
              ) : tenantDistribution.every((slice) => slice.value === 0) ? (
                <EmptyState inline title="No status data yet" />
              ) : (
                <div className="h-[170px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={tenantDistribution}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={42}
                        outerRadius={68}
                        stroke="transparent"
                      >
                        {tenantDistribution.map((entry) => (
                          <Cell key={entry.name} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          borderRadius: 12,
                          border: "1px solid var(--border)",
                          background: "var(--card)",
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
              <div className="space-y-2 text-sm">
                {tenantDistribution.map((entry) => (
                  <div key={entry.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                      <span>{entry.name}</span>
                    </div>
                    <span className="font-semibold">{entry.value}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
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
            <CardContent className="space-y-4">
              <div className="h-[180px]">
                {loading ? (
                  <Skeleton className="h-full w-full" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={auditTimeline} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" />
                      <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" />
                      <Tooltip
                        contentStyle={{
                          borderRadius: 12,
                          border: "1px solid var(--border)",
                          background: "var(--card)",
                        }}
                      />
                      <Line type="monotone" dataKey="actions" stroke="var(--chart-3)" strokeWidth={2.5} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
              <div className="grid gap-3 md:grid-cols-2 text-sm">
                <HealthRow label="Stripe webhooks" value="OK (placeholder)" />
                <HealthRow label="GBP tokens" value="OK (placeholder)" />
                <HealthRow label="Scheduler" value="Running" />
                <HealthRow label="Error rate (24h)" value="Low" />
              </div>
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

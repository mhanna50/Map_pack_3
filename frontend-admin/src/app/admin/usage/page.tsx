"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { adminApi } from "@/lib/adminApiClient";

type UsageAggregates = { posts?: number; reviews?: number; uploads?: number };
type UsageRanking = { tenant_id: string; posts: number; reviews: number };

export default function UsagePage() {
  const [aggregates, setAggregates] = useState<UsageAggregates | null>(null);
  const [rankings, setRankings] = useState<UsageRanking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await adminApi.usage();
        if (!active) return;
        setAggregates((data.aggregates ?? null) as UsageAggregates | null);
        setRankings((data.rankings ?? []) as UsageRanking[]);
      } catch (err: unknown) {
        if (!active) return;
        const message = err instanceof Error ? err.message : "Failed to load usage";
        setError(message);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  const rankingChartData = useMemo(
    () =>
      rankings.slice(0, 10).map((row) => ({
        tenant: row.tenant_id.slice(0, 8),
        posts: row.posts,
        reviews: row.reviews,
      })),
    [rankings],
  );

  const aggregateMix = useMemo(
    () => [
      { name: "Posts", value: aggregates?.posts ?? 0, color: "var(--chart-1)" },
      { name: "Reviews", value: aggregates?.reviews ?? 0, color: "var(--chart-2)" },
      { name: "Uploads", value: aggregates?.uploads ?? 0, color: "var(--chart-3)" },
    ],
    [aggregates],
  );

  return (
    <AdminShell>
      <div className="space-y-5">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Usage</p>
          <h1 className="text-2xl font-semibold">Platform usage & performance</h1>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <UsageCard label="Posts" value={aggregates?.posts} />
          <UsageCard label="Review requests" value={aggregates?.reviews} />
          <UsageCard label="Uploads" value={aggregates?.uploads} />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Usage comparison by tenant</CardTitle>
              <CardDescription>Top 10 tenants by posts and reviews</CardDescription>
            </CardHeader>
            <CardContent className="h-[280px]">
              {loading ? (
                <Skeleton className="h-full w-full" />
              ) : rankingChartData.length === 0 ? (
                <EmptyState inline title="No tenant usage data" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={rankingChartData} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="tenant" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 12,
                        border: "1px solid var(--border)",
                        background: "var(--card)",
                      }}
                    />
                    <Bar dataKey="posts" stackId="usage" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="reviews" stackId="usage" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Usage mix</CardTitle>
              <CardDescription>Platform-wide distribution</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {loading ? (
                <Skeleton className="h-36 w-full" />
              ) : aggregateMix.every((slice) => slice.value === 0) ? (
                <EmptyState inline title="No usage totals yet" />
              ) : (
                <div className="h-[170px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={aggregateMix}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={42}
                        outerRadius={68}
                        stroke="transparent"
                      >
                        {aggregateMix.map((entry) => (
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
                {aggregateMix.map((entry) => (
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

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Per-tenant ranking</CardTitle>
              <CardDescription>Top activity by posts + reviews</CardDescription>
            </div>
            <Badge variant="muted">Top 20</Badge>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-40 w-full" />
            ) : error ? (
              <EmptyState inline title="Could not load usage" description={error} />
            ) : rankings.length === 0 ? (
              <EmptyState inline title="No usage data" />
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Tenant</TH>
                    <TH>Posts</TH>
                    <TH>Reviews</TH>
                  </TR>
                </THead>
                <TBody>
                  {rankings.map((row) => (
                    <TR key={row.tenant_id}>
                      <TD>{row.tenant_id}</TD>
                      <TD>{row.posts}</TD>
                      <TD>{row.reviews}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  );
}

function UsageCard({ label, value }: { label: string; value?: number }) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-2 text-2xl font-semibold">{value ?? "—"}</p>
      </CardContent>
    </Card>
  );
}

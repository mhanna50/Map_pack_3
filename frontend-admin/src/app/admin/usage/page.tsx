"use client";

import { useEffect, useState } from "react";
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
        setAggregates(data.aggregates);
        setRankings(data.rankings ?? []);
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

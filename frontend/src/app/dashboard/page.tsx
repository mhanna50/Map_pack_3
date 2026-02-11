"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Sparkles, TrendingUp } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/shell";
import { KpiCard } from "@/components/kpi-card";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useTenant } from "@/lib/tenant-context";
import {
  getDashboardKpis,
  listContentAssets,
  listPostJobs,
  listPosts,
  listReviewRequests,
} from "@/lib/db";

type ActivityItem = {
  id: string | number;
  type: "post" | "review";
  title: string;
  timestamp: string;
  status?: string | null;
  location?: string | null;
};

export default function DashboardPage() {
  const { tenantId, locations, selectedLocationId, refresh: refreshTenant, loading: contextLoading } = useTenant();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kpis, setKpis] = useState({
    postsThisMonth: 0,
    scheduledPosts: 0,
    reviewRequestsSent: 0,
    reviewCompletions: 0,
  });
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [recommendation, setRecommendation] = useState<string | null>(null);
  const [statusMeta, setStatusMeta] = useState<{ lastPost?: string | null; nextPost?: string | null }>({});
  const [refreshKey, setRefreshKey] = useState(0);

  const handleRefresh = async () => {
    await refreshTenant();
    setRefreshKey((k) => k + 1);
  };

  useEffect(() => {
    if (!tenantId) {
      setLoading(false);
      return;
    }
    let active = true;
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [kpiData, recentPosts, scheduled, reviewRequests, assets] = await Promise.all([
          getDashboardKpis(tenantId, selectedLocationId ?? undefined),
          listPosts(tenantId, selectedLocationId ?? undefined, { limit: 5 }),
          listPostJobs(tenantId, selectedLocationId ?? undefined, { limit: 1 }),
          listReviewRequests(tenantId, selectedLocationId ?? undefined, { limit: 5 }),
          listContentAssets(tenantId, selectedLocationId ?? undefined, { limit: 5 }),
        ]);

        if (!active) return;
        setKpis(kpiData);

        const mappedPosts: ActivityItem[] = (recentPosts ?? []).map((post) => ({
          id: post.id,
          type: "post",
          title: post.content ?? "Post",
          timestamp: post.published_at,
          status: post.status,
          location: post.location_id,
        }));
        const mappedReviews: ActivityItem[] = (reviewRequests ?? []).map((req) => ({
          id: req.id,
          type: "review",
          title: req.customer_name ?? "Review request",
          timestamp: req.created_at,
          status: req.status,
          location: req.location_id,
        }));

        const combined = [...mappedPosts, ...mappedReviews].sort(
          (a, b) => new Date(b.timestamp ?? "").getTime() - new Date(a.timestamp ?? "").getTime(),
        );
        setActivity(combined.slice(0, 8));

        const lastPost = recentPosts?.[0]?.published_at ?? null;
        const nextPost = scheduled?.[0]?.scheduled_for ?? null;
        setStatusMeta({ lastPost, nextPost });

        if (assets && assets.length > 0) {
          const lastUsed = assets.find((a) => a.last_used_at)?.last_used_at ?? assets[0]?.created_at;
          const stale =
            lastUsed && new Date(lastUsed).getTime() < Date.now() - 14 * 24 * 60 * 60 * 1000;
          if (stale || assets.length < 3) {
            setRecommendation("Upload a fresh batch of photos to keep GBP posts engaging.");
          } else {
            setRecommendation(null);
          }
        } else {
          setRecommendation("Add at least 3 high-quality photos to improve ranking signals.");
        }
      } catch (err: unknown) {
        if (!active) return;
        const message = err instanceof Error ? err.message : "Unable to load dashboard data";
        setError(message);
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchData();
    return () => {
      active = false;
    };
  }, [tenantId, selectedLocationId, refreshKey]);

  const connectedLocations = useMemo(
    () => locations.filter((loc) => Boolean(loc.gbp_location_id)),
    [locations],
  );

  const renderActivity = () => {
    if (loading) {
      return <Skeleton className="h-28 w-full" />;
    }
    if (!activity.length) {
      return (
        <EmptyState
          inline
          title="No activity yet"
          description="Posts and review requests will appear here once automations run."
        />
      );
    }
    return (
      <div className="space-y-3">
        {activity.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between rounded-xl border border-border bg-white/60 px-3 py-2 text-sm"
          >
            <div className="flex items-center gap-3">
              <Badge variant={item.type === "post" ? "default" : "outline"}>{item.type === "post" ? "Post" : "Review"}</Badge>
              <div>
                <p className="font-medium text-foreground line-clamp-1">{item.title}</p>
                <p className="text-xs text-muted-foreground">
                  {item.location && <span className="mr-2 rounded-full bg-muted px-2 py-[2px]">{item.location}</span>}
                  {item.timestamp ? formatRelative(item.timestamp) : "—"}
                </p>
              </div>
            </div>
            {item.status && <Badge variant="muted">{item.status}</Badge>}
          </div>
        ))}
      </div>
    );
  };

  return (
    <DashboardShell onRefresh={handleRefresh}>
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Posts this month" value={kpis.postsThisMonth} delta="Auto-published" icon={<TrendingUp className="h-5 w-5 text-primary" />} />
          <KpiCard label="Scheduled posts" value={kpis.scheduledPosts} delta="Next 14 days" icon={<CalendarClock className="h-5 w-5 text-primary" />} />
          <KpiCard label="Review requests (30d)" value={kpis.reviewRequestsSent} delta="Sent" icon={<Sparkles className="h-5 w-5 text-primary" />} />
          <KpiCard label="Review completions (30d)" value={kpis.reviewCompletions} delta="Reviews left" icon={<Sparkles className="h-5 w-5 text-primary" />} />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Automation status</CardTitle>
                <CardDescription>GBP connection and scheduling health</CardDescription>
              </div>
              <Badge variant={connectedLocations.length ? "success" : "danger"}>
                {connectedLocations.length ? "Connected" : "Not connected"}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <StatusRow label="Locations connected" value={`${connectedLocations.length}/${locations.length || 1}`} />
                <StatusRow
                  label="Last post"
                  value={
                    statusMeta.lastPost ? formatRelative(statusMeta.lastPost) : "No posts yet"
                  }
                />
                <StatusRow
                  label="Next scheduled"
                  value={
                    statusMeta.nextPost
                      ? formatRelative(statusMeta.nextPost)
                      : "Not scheduled"
                  }
                />
                <StatusRow label="Automation queue" value={kpis.scheduledPosts ? "Active" : "Idle"} />
              </div>
              <div className="rounded-lg border border-dashed border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                Window focus or the refresh button will reload counts. Status cards auto-refresh only here to keep queries light.
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recommendations</CardTitle>
              <CardDescription>Keep your profile fresh</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {recommendation ? (
                <div className="rounded-lg bg-primary/5 p-3 text-sm text-foreground">{recommendation}</div>
              ) : (
                <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">Looks good. Automations are healthy.</div>
              )}
              <Button variant="outline" size="sm" className="w-full">
                Upload photos
              </Button>
              <Button variant="ghost" size="sm" className="w-full">
                Adjust prompts
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent activity</CardTitle>
              <CardDescription>Last posts and review requests</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={handleRefresh}>
              Refresh
            </Button>
          </CardHeader>
          <CardContent>{renderActivity()}</CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Coming soon</CardTitle>
            <CardDescription>Competitor insights and contact volume</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            <PlaceholderTile title="Local rank by keyword" />
            <PlaceholderTile title="Call & direction volume" />
            <PlaceholderTile title="Competitor watchlist" />
          </CardContent>
        </Card>

        {error && <p className="text-sm text-rose-600">Error: {error}</p>}
        {contextLoading && <Skeleton className="h-10 w-full" />}
      </div>
    </DashboardShell>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-white/60 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

function PlaceholderTile({ title }: { title: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground">Coming soon</p>
    </div>
  );
}

function formatRelative(dateString: string) {
  const date = new Date(dateString);
  const diffMs = date.getTime() - Date.now();
  const diffSec = Math.round(diffMs / 1000);
  const abs = Math.abs(diffSec);
  const units: [number, Intl.RelativeTimeFormatUnit][] = [
    [60 * 60 * 24 * 365, "year"],
    [60 * 60 * 24 * 30, "month"],
    [60 * 60 * 24, "day"],
    [60 * 60, "hour"],
    [60, "minute"],
    [1, "second"],
  ];
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  for (const [seconds, unit] of units) {
    if (abs >= seconds || unit === "second") {
      const value = Math.round(diffSec / seconds);
      return rtf.format(value, unit);
    }
  }
  return rtf.format(diffSec, "second");
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, Clock3 } from "lucide-react";
import {
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
import { DashboardShell } from "@/components/dashboard/shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useTenant } from "@/lib/tenant-context";
import { listPostJobs, listPosts } from "@/lib/db";
import { format } from "@/lib/date-utils";

type Post = {
  id: string | number;
  published_at?: string | null;
  content?: string | null;
  status?: string | null;
  location_id?: string | null;
  metrics?: { views?: number; clicks?: number };
};

type PostJob = {
  id: string | number;
  scheduled_for?: string | null;
  status?: string | null;
  location_id?: string | null;
  title?: string | null;
  template_id?: string | null;
};

const statusColorMap: Record<string, string> = {
  published: "var(--chart-2)",
  scheduled: "var(--chart-1)",
  queued: "var(--chart-3)",
  failed: "var(--chart-5)",
};

export default function GbpPage() {
  const { tenantId, selectedLocationId, refresh: refreshTenant } = useTenant();
  const [posts, setPosts] = useState<Post[]>([]);
  const [jobs, setJobs] = useState<PostJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
        const [postData, jobData] = await Promise.all([
          listPosts(tenantId, selectedLocationId ?? undefined, { limit: 25 }),
          listPostJobs(tenantId, selectedLocationId ?? undefined, { limit: 10 }),
        ]);
        if (!active) return;
        setPosts((postData ?? []) as Post[]);
        setJobs((jobData ?? []) as PostJob[]);
      } catch (err: unknown) {
        if (!active) return;
        const message = err instanceof Error ? err.message : "Failed to load GBP data";
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

  const engagementTrend = useMemo(() => {
    return [...posts]
      .filter((post) => Boolean(post.published_at))
      .sort((a, b) => new Date(a.published_at ?? "").getTime() - new Date(b.published_at ?? "").getTime())
      .slice(-12)
      .map((post) => ({
        label: new Date(post.published_at ?? "").toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        views: post.metrics?.views ?? 0,
        clicks: post.metrics?.clicks ?? 0,
      }));
  }, [posts]);

  const statusDistribution = useMemo(() => {
    const counts = new Map<string, number>();
    for (const post of posts) {
      const key = (post.status ?? "published").toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([name, value]) => ({
      name,
      value,
      color: statusColorMap[name] ?? "var(--chart-4)",
    }));
  }, [posts]);

  return (
    <DashboardShell onRefresh={handleRefresh}>
      <div className="space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">GBP Monitoring</p>
            <h1 className="text-2xl font-semibold">Posts & automation health</h1>
          </div>
          <Button variant="primary">Compose new post</Button>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Engagement trend</CardTitle>
            <CardDescription>Views and clicks from recent published posts</CardDescription>
          </CardHeader>
          <CardContent className="h-[280px]">
            {loading ? (
              <Skeleton className="h-full w-full" />
            ) : error ? (
              <EmptyState inline title="Could not load engagement trend" description={error} />
            ) : engagementTrend.length === 0 ? (
              <EmptyState inline title="No published post metrics yet" description="Publish posts to start tracking views and clicks over time." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={engagementTrend} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
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
                  <Line type="monotone" dataKey="views" stroke="var(--chart-1)" strokeWidth={2.5} dot={false} />
                  <Line type="monotone" dataKey="clicks" stroke="var(--chart-2)" strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Posts history</CardTitle>
              <CardDescription>Latest posts with performance metrics</CardDescription>
            </div>
            <Badge variant="outline" className="capitalize">
              {selectedLocationId ? "Filtered" : "All locations"}
            </Badge>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-40 w-full" />
            ) : error ? (
              <EmptyState inline title="Could not load posts" description={error} />
            ) : posts.length === 0 ? (
              <EmptyState
                inline
                title="No posts yet"
                description="When posts publish, they will appear here with metrics."
              />
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Published</TH>
                    <TH>Content</TH>
                    <TH>Status</TH>
                    <TH>Location</TH>
                    <TH>Metrics</TH>
                  </TR>
                </THead>
                <TBody>
                  {posts.map((post, index) => (
                    <TR key={post.id?.toString?.() ?? `post-${index}`}>
                      <TD>{format(post.published_at)}</TD>
                      <TD className="max-w-xs text-ellipsis text-sm leading-snug text-foreground line-clamp-2">
                        {post.content ?? "—"}
                      </TD>
                      <TD>
                        <Badge variant={post.status === "failed" ? "danger" : "success"}>{post.status ?? "Published"}</Badge>
                      </TD>
                      <TD>
                        <Badge variant="muted">{post.location_id ?? "All"}</Badge>
                      </TD>
                      <TD className="text-xs text-muted-foreground">
                        {post.metrics?.views ? `${post.metrics.views} views` : "—"}{" "}
                        {post.metrics?.clicks ? `• ${post.metrics.clicks} clicks` : ""}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center gap-3">
              <Clock3 className="h-5 w-5 text-primary" />
              <div>
                <CardTitle>Scheduled posts</CardTitle>
                <CardDescription>Queue for the next two weeks</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {loading ? (
                <Skeleton className="h-24 w-full" />
              ) : jobs.length === 0 ? (
                <EmptyState
                  inline
                  title="Nothing scheduled"
                  description="Create a new post to keep the cadence."
                  actionLabel="Create post"
                  onAction={() => {}}
                />
              ) : (
                jobs.map((job, index) => (
                  <div key={job.id?.toString?.() ?? `job-${index}`} className="flex items-center justify-between rounded-lg border border-border bg-white/60 px-3 py-2 text-sm">
                    <div>
                      <p className="font-semibold">{job.template_id ?? "Scheduled post"}</p>
                      <p className="text-xs text-muted-foreground">{format(job.scheduled_for)}</p>
                    </div>
                    <Badge variant="muted" className="capitalize">
                      {job.status ?? "scheduled"}
                    </Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center gap-3">
              <BarChart3 className="h-5 w-5 text-primary" />
              <div>
                <CardTitle>Performance mix</CardTitle>
                <CardDescription>Status distribution and totals</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {loading ? (
                <Skeleton className="h-40 w-full" />
              ) : statusDistribution.length === 0 ? (
                <EmptyState inline title="No post status data yet" description="Status distribution appears once posts are created." />
              ) : (
                <div className="h-[170px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={statusDistribution}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={44}
                        outerRadius={70}
                        stroke="transparent"
                        paddingAngle={2}
                      >
                        {statusDistribution.map((entry) => (
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
              <div className="space-y-2 text-xs">
                {statusDistribution.map((entry) => (
                  <div key={entry.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                      <span className="capitalize text-muted-foreground">{entry.name}</span>
                    </div>
                    <span className="font-semibold">{entry.value}</span>
                  </div>
                ))}
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span>Total views</span>
                  <span className="font-semibold">{aggregateMetric(posts, "views")}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Total clicks</span>
                  <span className="font-semibold">{aggregateMetric(posts, "clicks")}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {error && <p className="text-sm text-rose-600">Error: {error}</p>}
      </div>
    </DashboardShell>
  );
}

function aggregateMetric(posts: Post[], key: "views" | "clicks") {
  return posts.reduce((sum, post) => {
    const value = post.metrics && typeof post.metrics[key] === "number" ? (post.metrics[key] as number) : 0;
    return sum + value;
  }, 0);
}

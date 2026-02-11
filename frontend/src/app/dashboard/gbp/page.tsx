"use client";

import { useEffect, useState } from "react";
import { BarChart3, Clock3 } from "lucide-react";
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

export default function GbpPage() {
  const { tenantId, selectedLocationId, refresh: refreshTenant } = useTenant();
  const [posts, setPosts] = useState<Array<Record<string, unknown>>>([]);
  const [jobs, setJobs] = useState<Array<Record<string, unknown>>>([]);
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
        setPosts((postData ?? []) as Array<Record<string, unknown>>);
        setJobs((jobData ?? []) as Array<Record<string, unknown>>);
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
                  {posts.map((post) => (
                    <TR key={post.id}>
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
                jobs.map((job) => (
                  <div key={job.id} className="flex items-center justify-between rounded-lg border border-border bg-white/60 px-3 py-2 text-sm">
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
                <CardTitle>Performance</CardTitle>
                <CardDescription>Views & clicks (sample)</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-lg border border-dashed border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                Chart placeholder — connect metrics to visualize post engagement by location.
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

function aggregateMetric(posts: Array<Record<string, unknown>>, key: string) {
  return posts.reduce((sum, post) => {
    const metrics = post.metrics as Record<string, unknown> | undefined;
    const value = metrics && typeof metrics[key] === "number" ? (metrics[key] as number) : 0;
    return sum + value;
  }, 0);
}

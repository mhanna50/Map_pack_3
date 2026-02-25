"use client";

import { useEffect, useState } from "react";
import { ImagePlus, UploadCloud, Info } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useTenant } from "@/lib/tenant-context";
import { listContentAssets } from "@/lib/db";
import { format } from "@/lib/date-utils";

type ContentAsset = {
  id: string | number;
  tags?: string[];
  last_used_at?: string | null;
  created_at?: string | null;
};

export default function ContentPage() {
  const { tenantId, selectedLocationId, refresh: refreshTenant } = useTenant();
  const [assets, setAssets] = useState<ContentAsset[]>([]);
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
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await listContentAssets(tenantId, selectedLocationId ?? undefined, { limit: 30 });
        if (!active) return;
        setAssets((data ?? []) as ContentAsset[]);
      } catch (err: unknown) {
        if (!active) return;
        const message = err instanceof Error ? err.message : "Failed to load content assets";
        setError(message);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [tenantId, selectedLocationId, refreshKey]);

  return (
    <DashboardShell onRefresh={handleRefresh}>
      <div className="space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Content</p>
            <h1 className="text-2xl font-semibold">Upload photos & manage business info</h1>
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            Refresh
          </Button>
        </header>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Upload photos</CardTitle>
                <CardDescription>Drag and drop — will push to Supabase Storage</CardDescription>
              </div>
              <Button size="sm">
                <UploadCloud className="mr-2 h-4 w-4" />
                Upload
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                <ImagePlus className="mb-2 h-6 w-6 text-primary" />
                <p className="font-semibold text-foreground">Drop files or browse</p>
                <p className="text-xs text-muted-foreground">UI only; wire to Supabase Storage or existing uploader</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Prioritize if photo not uploaded in a while — we highlight assets older than 14 days.
              </p>
              {loading ? (
                <Skeleton className="h-32 w-full" />
              ) : error ? (
                <EmptyState inline title="Could not load gallery" description={error} />
              ) : assets.length === 0 ? (
                <EmptyState inline title="No uploads yet" description="Add your first photos to improve post quality." />
              ) : (
                <div className="grid gap-3 md:grid-cols-3">
                  {assets.map((asset, index) => (
                    <div
                      key={asset.id?.toString?.() ?? `asset-${index}`}
                      className="rounded-lg border border-border bg-white/70 p-3 shadow-sm"
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold line-clamp-1">{asset.tags?.join(", ") ?? "Asset"}</p>
                        <Badge variant="muted">#{asset.id}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Last used {format(asset.last_used_at)}</p>
                      <p className="text-xs text-muted-foreground">Uploaded {format(asset.created_at)}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Business info</CardTitle>
              <CardDescription>Services, highlights, seasonal notes</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <label className="block">
                <span className="text-muted-foreground">Services list</span>
                <textarea className="mt-1 w-full rounded-lg border border-border px-3 py-2" rows={3} placeholder="Installation, Maintenance, Emergency repairs" />
              </label>
              <label className="block">
                <span className="text-muted-foreground">Service highlights</span>
                <textarea className="mt-1 w-full rounded-lg border border-border px-3 py-2" rows={2} placeholder="Same-day dispatch, 24/7 hotline, financing available" />
              </label>
              <label className="block">
                <span className="text-muted-foreground">Seasonal notes</span>
                <textarea className="mt-1 w-full rounded-lg border border-border px-3 py-2" rows={2} placeholder="Winter furnace tune-ups, summer AC prep" />
              </label>
              <label className="block">
                <span className="text-muted-foreground">Q&A seeds</span>
                <textarea className="mt-1 w-full rounded-lg border border-border px-3 py-2" rows={2} placeholder="Do you offer after-hours service? Yes, 24/7." />
              </label>
              <Button className="w-full" variant="primary">
                Save info (UI only)
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <Info className="h-4 w-4 text-primary" />
            <div>
              <CardTitle>Rotation guidance</CardTitle>
              <CardDescription>How we pick assets for posts</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            We prioritize newer photos first. If nothing new was uploaded in the last 14 days, you&apos;ll see a reminder here. Connect this UI to your storage bucket and mark assets as
            &quot;last_used_at&quot; when attached to a post.
          </CardContent>
        </Card>

        {error && <p className="text-sm text-rose-600">Error: {error}</p>}
      </div>
    </DashboardShell>
  );
}

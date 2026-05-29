"use client";

import { useEffect, useState } from "react";
import { ImagePlus, UploadCloud, Info } from "lucide-react";
import { DashboardShell } from "@/features/dashboard/components/shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useTenant } from "@/features/tenants/tenant-context";
import { listContentAssets } from "@/lib/db";
import { fetchBackendJson } from "@/lib/backend-api";
import { format } from "@/lib/date-utils";

type ContentAsset = {
  id: string | number;
  tags?: string[];
  last_used_at?: string | null;
  created_at?: string | null;
};

export default function ContentPage() {
  const { tenantId, selectedLocationId, refresh: refreshTenant, supabase } = useTenant();
  const [assets, setAssets] = useState<ContentAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [services, setServices] = useState("");
  const [highlights, setHighlights] = useState("");
  const [seasonalNotes, setSeasonalNotes] = useState("");
  const [qnaSeeds, setQnaSeeds] = useState("");
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

  const requestPhotos = async () => {
    if (!tenantId || !selectedLocationId) {
      setError("Select a location before requesting photos.");
      return;
    }
    setWorking(true);
    setError(null);
    setMessage(null);
    try {
      const result = await fetchBackendJson<{ created: boolean }>(
        "/media/requests",
        {
          method: "POST",
          body: JSON.stringify({ organization_id: tenantId, location_id: selectedLocationId, days_without_upload: 0 }),
        },
        supabase,
      );
      setMessage(result.created ? "Photo request created." : "A photo request is already active for this location.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to request photos");
    } finally {
      setWorking(false);
    }
  };

  const saveBusinessInfo = async () => {
    if (!selectedLocationId) {
      setError("Select a location before saving business info.");
      return;
    }
    setWorking(true);
    setError(null);
    setMessage(null);
    try {
      await fetchBackendJson(
        `/orgs/locations/${selectedLocationId}/settings`,
        {
          method: "PUT",
          body: JSON.stringify({
            services: services.split(/\n|,/).map((item) => item.trim()).filter(Boolean),
            voice_profile: {
              highlights,
              seasonal_notes: seasonalNotes,
              qna_seeds: qnaSeeds,
            },
          }),
        },
        supabase,
      );
      setMessage("Business info saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save business info");
    } finally {
      setWorking(false);
    }
  };

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
            <CardHeader className="flex flex-col items-start justify-between sm:flex-row sm:items-center">
              <div>
                <CardTitle>Upload photos</CardTitle>
                <CardDescription>Drag and drop — will push to Supabase Storage</CardDescription>
              </div>
              <Button size="sm" onClick={requestPhotos} disabled={working || !selectedLocationId}>
                <UploadCloud className="mr-2 h-4 w-4" />
                Request photos
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                <ImagePlus className="mb-2 h-6 w-6 text-primary" />
                <p className="font-semibold text-foreground">Photo requests and uploaded assets</p>
                <p className="text-xs text-muted-foreground">Request fresh photos for the selected location, then review uploaded assets here.</p>
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
                <textarea className="mt-1 w-full rounded-lg border border-border px-3 py-2" rows={3} placeholder="Installation, Maintenance, Emergency repairs" value={services} onChange={(event) => setServices(event.target.value)} />
              </label>
              <label className="block">
                <span className="text-muted-foreground">Service highlights</span>
                <textarea className="mt-1 w-full rounded-lg border border-border px-3 py-2" rows={2} placeholder="Same-day dispatch, 24/7 hotline, financing available" value={highlights} onChange={(event) => setHighlights(event.target.value)} />
              </label>
              <label className="block">
                <span className="text-muted-foreground">Seasonal notes</span>
                <textarea className="mt-1 w-full rounded-lg border border-border px-3 py-2" rows={2} placeholder="Winter furnace tune-ups, summer AC prep" value={seasonalNotes} onChange={(event) => setSeasonalNotes(event.target.value)} />
              </label>
              <label className="block">
                <span className="text-muted-foreground">Q&A seeds</span>
                <textarea className="mt-1 w-full rounded-lg border border-border px-3 py-2" rows={2} placeholder="Do you offer after-hours service? Yes, 24/7." value={qnaSeeds} onChange={(event) => setQnaSeeds(event.target.value)} />
              </label>
              <Button className="w-full" variant="primary" onClick={saveBusinessInfo} disabled={working || !selectedLocationId}>
                {working ? "Saving..." : "Save info"}
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex flex-col items-start gap-2">
            <Info className="h-4 w-4 text-primary" />
            <div>
              <CardTitle>Rotation guidance</CardTitle>
              <CardDescription>How we pick assets for posts</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            We prioritize newer photos first. If nothing new was uploaded in the last 14 days, you&apos;ll see a reminder here.
          </CardContent>
        </Card>

        {message && <p className="text-sm text-emerald-700">{message}</p>}
        {error && <p className="text-sm text-rose-600">Error: {error}</p>}
      </div>
    </DashboardShell>
  );
}

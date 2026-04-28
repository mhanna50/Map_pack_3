"use client";

import { useEffect, useMemo, useState } from "react";
import { DashboardShell } from "@/features/dashboard/components/shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { GeoHeatmap, type ScanPayload } from "@/features/rank_tracking/components/geo-heatmap";
import { Drawer } from "@/components/drawer";
import { useTenant } from "@/features/tenants/tenant-context";
import { fetchBackendJson } from "@/lib/backend-api";

type DashboardPayload = {
  has_data: boolean;
  cycle: {
    id: string;
    cycle_year: number;
    cycle_month: number;
    status: string;
    trigger_source: string;
  } | null;
  overview: {
    cycle_month?: string;
    target_keywords?: number;
    avg_baseline_rank?: number | null;
    avg_followup_rank?: number | null;
    avg_improvement?: number | null;
    posts_generated?: number;
    gbp_updates_applied?: number;
    visibility_baseline?: number | null;
    visibility_followup?: number | null;
  };
  keywords: Array<{
    id: string;
    keyword: string;
    target_city_or_area?: string | null;
    search_volume?: number | null;
    intent_level?: string | null;
    competition_level?: string | null;
    baseline_rank?: number | null;
    latest_rank?: number | null;
    rank_change?: number | null;
    why_selected?: string | null;
    classifications?: string[];
    score_breakdown?: Record<string, number>;
  }>;
  opportunities: Record<string, Array<{ keyword: string; reason: string }>>;
  gbp_actions: Array<{
    id: string;
    action_type: string;
    status: string;
    source_keywords: string[];
    notes?: string | null;
  }>;
  post_plan: Array<{
    id: string;
    target_keyword: string;
    secondary_keywords: string[];
    post_angle: string;
    post_type: string;
    cta?: string | null;
    suggested_image_theme?: string | null;
    publish_date: string;
    status: string;
  }>;
  geo_grid: Record<
    string,
    {
      baseline?: ScanPayload | null;
      followup?: ScanPayload | null;
      delta?: { average_rank_delta?: number | null; visibility_delta?: number | null } | null;
    }
  >;
  history: Array<{
    cycle_id: string;
    cycle_label: string;
    avg_baseline_rank?: number | null;
    avg_followup_rank?: number | null;
    avg_rank_change?: number | null;
    posts_generated_from_keywords?: number;
    gbp_updates_applied?: number;
  }>;
  audit: {
    selected_score_breakdowns?: Array<{
      keyword: string;
      why_selected: string;
      score_breakdown: Record<string, number>;
      classifications: string[];
    }>;
    rejected_candidates?: Array<{
      keyword: string;
      overall_score: number;
      rejection_reason?: string | null;
      classifications?: string[];
    }>;
    data_sources?: Record<string, string>;
  };
};

type CycleRow = {
  id: string;
  cycle_year: number;
  cycle_month: number;
  status: string;
  trigger_source: string;
};

export default function KeywordStrategyPage() {
  const { tenantId, selectedLocationId, supabase, refresh: refreshTenant } = useTenant();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [cycles, setCycles] = useState<CycleRow[]>([]);
  const [cycleId, setCycleId] = useState<string | null>(null);
  const [keyword, setKeyword] = useState<string | null>(null);
  const [auditOpen, setAuditOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [running, setRunning] = useState(false);

  const handleRefresh = async () => {
    await refreshTenant();
    setRefreshKey((value) => value + 1);
  };

  useEffect(() => {
    if (!tenantId || !selectedLocationId) {
      setDashboard(null);
      setCycles([]);
      setLoading(false);
      return;
    }
    let active = true;
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [dashboardPayload, cycleRows] = await Promise.all([
          fetchBackendJson<DashboardPayload>(
            `/keyword-strategy/locations/${selectedLocationId}/dashboard`,
            {
              query: {
                organization_id: tenantId,
                cycle_id: cycleId,
              },
            },
            supabase,
          ),
          fetchBackendJson<CycleRow[]>(
            `/keyword-strategy/locations/${selectedLocationId}/cycles`,
            {
              query: {
                organization_id: tenantId,
                limit: 18,
              },
            },
            supabase,
          ),
        ]);
        if (!active) return;
        setDashboard(dashboardPayload);
        setCycles(cycleRows);
        if (!cycleId && dashboardPayload.cycle?.id) {
          setCycleId(dashboardPayload.cycle.id);
        }
      } catch (err: unknown) {
        if (!active) return;
        const message = err instanceof Error ? err.message : "Failed to load keyword strategy";
        setError(message);
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchData();
    return () => {
      active = false;
    };
  }, [tenantId, selectedLocationId, cycleId, refreshKey, supabase]);

  const availableKeywords = useMemo(() => Object.keys(dashboard?.geo_grid ?? {}), [dashboard?.geo_grid]);
  const activeKeyword = keyword && availableKeywords.includes(keyword) ? keyword : availableKeywords[0] ?? null;
  const geo = activeKeyword ? dashboard?.geo_grid?.[activeKeyword] : null;

  useEffect(() => {
    if (!availableKeywords.length) {
      setKeyword(null);
      return;
    }
    if (!keyword || !availableKeywords.includes(keyword)) {
      setKeyword(availableKeywords[0]);
    }
  }, [availableKeywords, keyword]);

  const runCampaignNow = async () => {
    if (!tenantId || !selectedLocationId) return;
    try {
      setRunning(true);
      await fetchBackendJson(
        "/keyword-strategy/run",
        {
          method: "POST",
          body: JSON.stringify({
            organization_id: tenantId,
            location_id: selectedLocationId,
            trigger_source: "manual",
            onboarding_triggered: false,
          }),
        },
        supabase,
      );
      setRefreshKey((value) => value + 1);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to run campaign";
      setError(message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <DashboardShell onRefresh={handleRefresh}>
      <div className="space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Keyword Strategy</p>
            <h1 className="text-2xl font-semibold">Local keyword rankings</h1>
            <p className="text-sm text-muted-foreground">Discovery, GBP optimization, monthly posting, and before/after geo-grid reporting.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setAuditOpen(true)}>
              Open audit
            </Button>
            <Button onClick={runCampaignNow} disabled={running || !tenantId || !selectedLocationId}>
              {running ? "Running..." : "Run cycle now"}
            </Button>
          </div>
        </header>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Campaign cycle</CardTitle>
              <CardDescription>Switch months or inspect historical keyword sets</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <select
                className="rounded-lg border border-border bg-white px-3 py-2 text-sm"
                value={cycleId ?? ""}
                onChange={(event) => setCycleId(event.target.value || null)}
              >
                {cycles.map((row) => (
                  <option key={row.id} value={row.id}>
                    {`${monthLabel(row.cycle_month)} ${row.cycle_year}`} | {row.status}
                  </option>
                ))}
                {!cycles.length && <option value="">No cycles</option>}
              </select>
              <Badge variant="outline" className="capitalize">
                {dashboard?.cycle?.status ?? "-"}
              </Badge>
            </div>
          </CardHeader>
        </Card>

        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : error ? (
          <EmptyState inline title="Unable to load keyword strategy" description={error} />
        ) : !dashboard?.has_data ? (
          <EmptyState inline title="No keyword cycle yet" description="Run your first keyword strategy cycle to generate keywords, GBP updates, and geo-grid scans." />
        ) : (
          <>
            <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <MetricCard title="Current cycle" value={dashboard.overview.cycle_month ?? "-"} />
              <MetricCard title="Target keywords" value={String(dashboard.overview.target_keywords ?? 0)} />
              <MetricCard title="Avg baseline rank" value={formatNumber(dashboard.overview.avg_baseline_rank)} />
              <MetricCard title="Avg follow-up rank" value={formatNumber(dashboard.overview.avg_followup_rank)} />
              <MetricCard title="Avg improvement" value={formatSigned(dashboard.overview.avg_improvement)} />
              <MetricCard title="Posts from keyword set" value={String(dashboard.overview.posts_generated ?? 0)} />
              <MetricCard title="GBP updates applied" value={String(dashboard.overview.gbp_updates_applied ?? 0)} />
              <MetricCard title="Visibility change" value={visibilityDelta(dashboard.overview.visibility_baseline, dashboard.overview.visibility_followup)} />
            </section>

            <Card>
              <CardHeader>
                <CardTitle>Selected 10 keywords</CardTitle>
                <CardDescription>Search demand, ranking movement, and plain-English selection reasoning</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <THead>
                    <TR>
                      <TH>Keyword</TH>
                      <TH>Area</TH>
                      <TH>Volume</TH>
                      <TH>Intent</TH>
                      <TH>Competition</TH>
                      <TH>Baseline</TH>
                      <TH>Latest</TH>
                      <TH>Change</TH>
                      <TH>Why selected</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {dashboard.keywords.map((item) => (
                      <TR key={item.id}>
                        <TD className="font-semibold">{item.keyword}</TD>
                        <TD>{item.target_city_or_area ?? "Primary city"}</TD>
                        <TD>{item.search_volume ?? "-"}</TD>
                        <TD>
                          <Badge variant={item.intent_level === "high" ? "success" : item.intent_level === "medium" ? "warning" : "muted"}>
                            {item.intent_level ?? "-"}
                          </Badge>
                        </TD>
                        <TD>
                          <Badge variant={item.competition_level === "low" ? "success" : item.competition_level === "high" ? "danger" : "warning"}>
                            {item.competition_level ?? "-"}
                          </Badge>
                        </TD>
                        <TD>{formatNumber(item.baseline_rank)}</TD>
                        <TD>{formatNumber(item.latest_rank)}</TD>
                        <TD>{formatSigned(item.rank_change)}</TD>
                        <TD className="max-w-xs text-xs text-muted-foreground">{item.why_selected ?? "-"}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </CardContent>
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Keyword opportunities</CardTitle>
                  <CardDescription>Grouped by strategic purpose</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {Object.entries(dashboard.opportunities ?? {}).map(([key, values]) => (
                    <div key={key} className="rounded-lg border border-border bg-white/70 p-3">
                      <p className="text-sm font-semibold capitalize">{key.replace(/_/g, " ")}</p>
                      {!values.length ? (
                        <p className="text-xs text-muted-foreground">No terms in this group this cycle.</p>
                      ) : (
                        <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                          {values.map((value) => (
                            <li key={`${key}-${value.keyword}`}>
                              <span className="font-semibold text-foreground">{value.keyword}</span>: {value.reason}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>GBP optimization actions</CardTitle>
                  <CardDescription>Applied, pending, and recommended updates linked to selected keywords</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {dashboard.gbp_actions.map((action) => (
                    <div key={action.id} className="rounded-lg border border-border bg-white/70 p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold">{action.action_type.replace(/_/g, " ")}</p>
                        <Badge variant={statusVariant(action.status)} className="capitalize">
                          {action.status}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{action.notes ?? "-"}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Keywords: {action.source_keywords?.length ? action.source_keywords.join(", ") : "-"}
                      </p>
                    </div>
                  ))}
                  {!dashboard.gbp_actions.length && <EmptyState inline title="No GBP actions" description="Actions will appear once a cycle runs." />}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Monthly post keyword plan</CardTitle>
                <CardDescription>Target keyword coverage across service, offer, trust, local, and seasonal posts</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <THead>
                    <TR>
                      <TH>Date</TH>
                      <TH>Keyword</TH>
                      <TH>Angle</TH>
                      <TH>Type</TH>
                      <TH>CTA</TH>
                      <TH>Image theme</TH>
                      <TH>Status</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {dashboard.post_plan.map((item) => (
                      <TR key={item.id}>
                        <TD>{new Date(item.publish_date).toLocaleDateString()}</TD>
                        <TD className="font-semibold">{item.target_keyword}</TD>
                        <TD>{item.post_angle.replace(/_/g, " ")}</TD>
                        <TD className="capitalize">{item.post_type}</TD>
                        <TD>{item.cta ?? "-"}</TD>
                        <TD>{item.suggested_image_theme ?? "-"}</TD>
                        <TD>
                          <Badge variant={statusVariant(item.status)} className="capitalize">
                            {item.status}
                          </Badge>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Before vs after geo grid</CardTitle>
                  <CardDescription>Heatmap comparison by keyword for this campaign cycle</CardDescription>
                </div>
                <select
                  className="rounded-lg border border-border bg-white px-3 py-2 text-sm"
                  value={activeKeyword ?? ""}
                  onChange={(event) => setKeyword(event.target.value || null)}
                >
                  {availableKeywords.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </CardHeader>
              <CardContent className="grid gap-4 lg:grid-cols-2">
                {geo?.delta && (
                  <div className="lg:col-span-2 grid gap-2 md:grid-cols-2">
                    <div className="rounded-lg border border-border bg-white px-3 py-2 text-xs">
                      <p className="uppercase tracking-wide text-muted-foreground">Average rank delta</p>
                      <p className="text-sm font-semibold">{formatSigned(geo.delta.average_rank_delta)}</p>
                    </div>
                    <div className="rounded-lg border border-border bg-white px-3 py-2 text-xs">
                      <p className="uppercase tracking-wide text-muted-foreground">Visibility delta</p>
                      <p className="text-sm font-semibold">
                        {geo.delta.visibility_delta == null ? "-" : `${formatSigned(geo.delta.visibility_delta)}%`}
                      </p>
                    </div>
                  </div>
                )}
                <GeoHeatmap title="Baseline" subtitle="Before optimization rollout" scan={geo?.baseline} />
                <GeoHeatmap title="Follow-up" subtitle="After rollout" scan={geo?.followup} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Campaign history</CardTitle>
                <CardDescription>Previous cycles and trend over time</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <THead>
                    <TR>
                      <TH>Cycle</TH>
                      <TH>Baseline</TH>
                      <TH>Follow-up</TH>
                      <TH>Improvement</TH>
                      <TH>Posts</TH>
                      <TH>GBP updates</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {dashboard.history.map((item) => (
                      <TR key={item.cycle_id}>
                        <TD>{item.cycle_label}</TD>
                        <TD>{formatNumber(item.avg_baseline_rank)}</TD>
                        <TD>{formatNumber(item.avg_followup_rank)}</TD>
                        <TD>{formatSigned(item.avg_rank_change)}</TD>
                        <TD>{item.posts_generated_from_keywords ?? 0}</TD>
                        <TD>{item.gbp_updates_applied ?? 0}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </CardContent>
            </Card>
          </>
        )}

        <Drawer open={auditOpen} onClose={() => setAuditOpen(false)} title="Keyword scoring audit">
          {!dashboard?.audit ? (
            <EmptyState inline title="No audit data" description="Run a cycle to populate score transparency details." />
          ) : (
            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Selected keywords</p>
                <div className="mt-2 space-y-3">
                  {(dashboard.audit.selected_score_breakdowns ?? []).map((item) => (
                    <div key={item.keyword} className="rounded-lg border border-border p-3">
                      <p className="text-sm font-semibold">{item.keyword}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{item.why_selected}</p>
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        {Object.entries(item.score_breakdown ?? {})
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(" | ")}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rejected candidates</p>
                <div className="mt-2 space-y-2">
                  {(dashboard.audit.rejected_candidates ?? []).slice(0, 20).map((item) => (
                    <div key={item.keyword} className="rounded-lg border border-border p-2 text-xs">
                      <p className="font-semibold">{item.keyword}</p>
                      <p className="text-muted-foreground">
                        score: {item.overall_score} | reason: {item.rejection_reason ?? "Not in top 10"}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Data sources</p>
                <pre className="mt-2 overflow-auto rounded-lg bg-muted p-3 text-[11px]">
                  {JSON.stringify(dashboard.audit.data_sources ?? {}, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </Drawer>
      </div>
    </DashboardShell>
  );
}

function MetricCard({ title, value }: { title: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}

function monthLabel(month: number) {
  return new Date(2026, month - 1, 1).toLocaleDateString(undefined, { month: "short" });
}

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return Number(value).toFixed(2);
}

function formatSigned(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  const rounded = Number(value).toFixed(2);
  return value > 0 ? `+${rounded}` : rounded;
}

function visibilityDelta(before?: number | null, after?: number | null) {
  if (before == null || after == null) return "-";
  const delta = Number(after) - Number(before);
  const rounded = delta.toFixed(2);
  return delta > 0 ? `+${rounded}%` : `${rounded}%`;
}

function statusVariant(status: string): "default" | "outline" | "success" | "warning" | "danger" | "muted" {
  const normalized = status.toLowerCase();
  if (normalized === "applied" || normalized === "published" || normalized === "completed") return "success";
  if (normalized === "failed") return "danger";
  if (normalized === "pending_review" || normalized === "queued" || normalized === "scheduled") return "warning";
  if (normalized === "recommended") return "muted";
  return "outline";
}

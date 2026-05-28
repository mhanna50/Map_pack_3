"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ClipboardCheck, Wand2 } from "lucide-react";
import { DashboardShell } from "@/features/dashboard/components/shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog } from "@/components/ui/dialog";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { useTenant } from "@/features/tenants/tenant-context";
import { fetchBackendJson } from "@/lib/backend-api";

type Audit = {
  id: string;
  audited_at: string | null;
  profile_completeness_score: number | null;
  status: string;
  trigger_source: string;
  summary: Record<string, unknown>;
};

type AuditItem = {
  id: string;
  field_name: string;
  title: string;
  current_value: unknown;
  recommended_value: unknown;
  severity: string;
  status: string;
  auto_fixable: boolean;
  user_action_required: boolean;
  instructions?: string | null;
  seo_reason?: string | null;
};

type AuditPayload = {
  has_data: boolean;
  latest: Audit | null;
  items: AuditItem[];
  missing_fields: AuditItem[];
  auto_fixable_items: AuditItem[];
  user_action_required_items: AuditItem[];
  history: Audit[];
  popup?: { should_show?: boolean; action_required?: boolean; cta_path?: string };
  readiness?: {
    status: string;
    ready: boolean;
    blocking_reasons?: string[];
  };
};

export default function GbpAuditPage() {
  const { tenantId, selectedLocationId, supabase, refresh } = useTenant();
  const [payload, setPayload] = useState<AuditPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [popupOpen, setPopupOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    if (!tenantId || !selectedLocationId) {
      setPayload(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchBackendJson<AuditPayload>(
        `/optimization/gbp-audit/locations/${selectedLocationId}/latest`,
        { query: { organization_id: tenantId } },
        supabase,
      );
      setPayload(data);
      setPopupOpen(Boolean(data.popup?.should_show));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load GBP audit");
    } finally {
      setLoading(false);
    }
  }, [tenantId, selectedLocationId, supabase]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const runAudit = async () => {
    if (!tenantId || !selectedLocationId) return;
    setWorking(true);
    try {
      await fetchBackendJson(
        "/optimization/gbp-audit/run",
        {
          method: "POST",
          body: JSON.stringify({ organization_id: tenantId, location_id: selectedLocationId, trigger_source: "manual" }),
        },
        supabase,
      );
      setRefreshKey((value) => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Audit failed");
    } finally {
      setWorking(false);
    }
  };

  const applyAutoFixes = async () => {
    if (!payload?.latest?.id) return;
    setWorking(true);
    try {
      await fetchBackendJson(`/optimization/gbp-audit/${payload.latest.id}/apply-auto-fixes`, { method: "POST" }, supabase);
      setRefreshKey((value) => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Auto-fix preparation failed");
    } finally {
      setWorking(false);
    }
  };

  const updateStatus = async (itemId: string, status: "complete" | "dismissed") => {
    setWorking(true);
    try {
      await fetchBackendJson(
        `/optimization/gbp-audit/items/${itemId}`,
        { method: "PATCH", body: JSON.stringify({ status }) },
        supabase,
      );
      setRefreshKey((value) => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Status update failed");
    } finally {
      setWorking(false);
    }
  };

  const score = payload?.latest?.profile_completeness_score ?? 0;
  const sections = useMemo(
    () => [
      { title: "User action required", items: payload?.user_action_required_items ?? [], icon: AlertTriangle },
      { title: "Reviewable auto-fixes", items: payload?.auto_fixable_items ?? [], icon: Wand2 },
      { title: "All audit items", items: payload?.items ?? [], icon: ClipboardCheck },
    ],
    [payload],
  );

  return (
    <DashboardShell onRefresh={async () => { await refresh(); setRefreshKey((value) => value + 1); }}>
      <div className="space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Business Profile Audit</p>
            <h1 className="text-2xl font-semibold">GBP Audit</h1>
            <p className="text-sm text-muted-foreground">Monthly profile completeness, safe updates, and required client actions.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={applyAutoFixes} disabled={working || !payload?.auto_fixable_items?.length}>Prepare auto-fixes</Button>
            <Button onClick={runAudit} disabled={working || !tenantId || !selectedLocationId}>{working ? "Working..." : "Run audit"}</Button>
          </div>
        </header>

        {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : !payload?.has_data ? (
          <EmptyState title="No GBP audit yet" description="Run an audit to create the baseline profile health checklist." actionLabel="Run audit" onAction={runAudit} />
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-4">
              <Card>
                <CardHeader><CardTitle>Score</CardTitle><CardDescription>Profile completeness</CardDescription></CardHeader>
                <CardContent><div className="text-4xl font-semibold">{Math.round(score)}%</div></CardContent>
              </Card>
              <MetricCard label="Missing fields" value={payload.missing_fields.length} />
              <MetricCard label="Auto-fixable" value={payload.auto_fixable_items.length} />
              <MetricCard label="User actions" value={payload.user_action_required_items.length} />
            </div>

            <Card>
              <CardHeader><CardTitle>Automation readiness</CardTitle><CardDescription>Gate for posting, review, and keyword automations</CardDescription></CardHeader>
              <CardContent className="flex flex-wrap items-center gap-3">
                <Badge variant={payload.readiness?.ready ? "success" : "warning"}>
                  {(payload.readiness?.status ?? "audit_required").replaceAll("_", " ")}
                </Badge>
                <p className="text-sm text-muted-foreground">
                  {payload.readiness?.ready ? "Automations may run." : (payload.readiness?.blocking_reasons ?? []).join(", ") || "Setup still required."}
                </p>
              </CardContent>
            </Card>

            {sections.map(({ title, items, icon: Icon }) => (
              <Card key={title}>
                <CardHeader className="flex flex-col items-start justify-between sm:flex-row sm:items-center">
                  <div>
                    <CardTitle className="flex items-center gap-2"><Icon className="h-4 w-4" />{title}</CardTitle>
                    <CardDescription>{items.length} item{items.length === 1 ? "" : "s"}</CardDescription>
                  </div>
                </CardHeader>
                <CardContent>
                  {!items.length ? (
                    <EmptyState inline title="Nothing to review" description="This section is clear." />
                  ) : (
                    <Table>
                      <THead><TR><TH>Item</TH><TH>Status</TH><TH>Why it matters</TH><TH>Action</TH></TR></THead>
                      <TBody>
                        {items.map((item) => (
                          <TR key={item.id}>
                            <TD>
                              <div className="font-medium">{item.title}</div>
                              <div className="max-w-xl text-xs text-muted-foreground">{item.instructions}</div>
                            </TD>
                            <TD><Badge variant={badgeVariant(item.status)}>{item.status.replaceAll("_", " ")}</Badge></TD>
                            <TD className="max-w-md text-sm text-muted-foreground">{item.seo_reason}</TD>
                            <TD className="space-x-2">
                              {item.status !== "complete" && <Button size="sm" variant="outline" onClick={() => updateStatus(item.id, "complete")}>Complete</Button>}
                              {item.status !== "dismissed" && <Button size="sm" variant="ghost" onClick={() => updateStatus(item.id, "dismissed")}>Dismiss</Button>}
                            </TD>
                          </TR>
                        ))}
                      </TBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            ))}

            <Card>
              <CardHeader><CardTitle>Audit history</CardTitle><CardDescription>Recent monthly runs</CardDescription></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {payload.history.map((audit) => (
                    <div key={audit.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                      <span>{audit.audited_at ? new Date(audit.audited_at).toLocaleString() : "Pending"}</span>
                      <Badge variant="outline">{audit.trigger_source}</Badge>
                      <span className="font-semibold">{Math.round(audit.profile_completeness_score ?? 0)}%</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </>
        )}

        <Dialog
          open={popupOpen}
          onOpenChange={setPopupOpen}
          title="GBP audit complete"
          description={payload?.popup?.action_required ? "Action is required to improve profile health." : "Review suggested profile updates."}
          footer={<Button onClick={() => setPopupOpen(false)}>Review audit</Button>}
        >
          <p className="text-sm text-muted-foreground">
            Latest score: {Math.round(score)}%. {payload?.user_action_required_items.length ?? 0} user actions and {payload?.auto_fixable_items.length ?? 0} reviewable auto-fixes found.
          </p>
        </Dialog>
      </div>
    </DashboardShell>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardHeader><CardTitle>{label}</CardTitle><CardDescription>Latest audit</CardDescription></CardHeader>
      <CardContent><div className="text-3xl font-semibold">{value}</div></CardContent>
    </Card>
  );
}

function badgeVariant(status: string): "success" | "danger" | "warning" | "muted" {
  if (status === "complete" || status === "auto_updated") return "success";
  if (status === "user_action_required") return "danger";
  if (status === "needs_review" || status === "pending_approval") return "warning";
  return "muted";
}

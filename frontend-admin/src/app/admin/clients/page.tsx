"use client";

import { useEffect, useMemo, useState } from "react";
import { Eye, Shield, Ban, MapPin } from "lucide-react";
import { AdminShell } from "@/components/admin/shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet } from "@/components/ui/sheet";
import { Dialog } from "@/components/ui/dialog";
import { adminApi } from "@/lib/adminApiClient";
import { formatDate, timeAgo } from "@/lib/date-utils";
import { useToast } from "@/components/ui/toast";

type Tenant = {
  tenant_id: string;
  business_name: string;
  status: string;
  plan_name?: string;
  location_limit?: number;
  last_activity?: string;
  created_at?: string;
};

type Location = { id: string; name?: string; gbp_location_id?: string | null; is_active?: boolean | null };
type Connection = { id?: string; status?: string; google_account_email?: string | null };
type Post = { id: string; title?: string; published_at?: string };
type Review = { id: string; created_at?: string; status?: string };
type AuditEntry = { id?: string; event_type?: string; created_at?: string };
type TenantDetail = {
  tenant?: Tenant;
  locations?: Location[];
  connections?: Connection[];
  posts?: Post[];
  reviews?: Review[];
  audits?: AuditEntry[];
};

export default function AdminClientsPage() {
  const { pushToast } = useToast();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState<{ status?: string; plan?: string; q?: string }>({});
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TenantDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [terminateId, setTerminateId] = useState<string | null>(null);
  const pageSize = 15;

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await adminApi.tenants({ page, pageSize, ...filters });
        if (!active) return;
        setTenants((data.rows ?? []) as Tenant[]);
        setTotal(data.total ?? 0);
      } catch (err: unknown) {
        if (!active) return;
        const message = err instanceof Error ? err.message : "Failed to load tenants";
        setError(message);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [page, filters]);

  const openDetail = async (id: string) => {
    setDetailId(id);
    setDetailLoading(true);
    try {
      const data = (await adminApi.tenant(id)) as TenantDetail;
      setDetail(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load tenant";
      pushToast({ title: "Failed to load tenant", description: message, tone: "error" });
    } finally {
      setDetailLoading(false);
    }
  };

  const handleImpersonate = async (id: string) => {
    try {
      await adminApi.impersonateStart(id, "Manual support");
      pushToast({ title: "Impersonation started", tone: "success" });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to impersonate";
      pushToast({ title: "Failed to impersonate", description: message, tone: "error" });
    }
  };

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total]);

  return (
    <AdminShell
      onSearch={(term) => setFilters((f) => ({ ...f, q: term }))}
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Clients</p>
            <h1 className="text-2xl font-semibold">All tenants</h1>
            <p className="text-sm text-muted-foreground">Active, churned, billing, and impersonation controls.</p>
          </div>
          <Badge variant="muted">Total {total}</Badge>
        </div>

        <Card>
          <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Filters</CardTitle>
              <CardDescription>Search by name/email/domain; filter by status and plan</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Input placeholder="Search" className="w-48" value={filters.q ?? ""} onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))} />
              <Select
                className="w-36"
                value={filters.status ?? ""}
                onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value || undefined }))}
                options={[
                  { label: "All status", value: "" },
                  { label: "Active", value: "active" },
                  { label: "Past due", value: "past_due" },
                  { label: "Canceled", value: "canceled" },
                  { label: "Churned", value: "churned" },
                ]}
              />
              <Select
                className="w-32"
                value={filters.plan ?? ""}
                onChange={(e) => setFilters((f) => ({ ...f, plan: e.target.value || undefined }))}
                options={[
                  { label: "All plans", value: "" },
                  { label: "Starter", value: "starter" },
                  { label: "Pro", value: "pro" },
                  { label: "Agency", value: "agency" },
                ]}
              />
              <Button variant="outline" size="sm" onClick={() => setPage(1)}>
                Apply
              </Button>
            </div>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Tenants</CardTitle>
            <Button variant="outline" size="sm" onClick={() => setPage(1)}>
              Refresh
            </Button>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-48 w-full" />
            ) : error ? (
              <EmptyState inline title="Could not load tenants" description={error} />
            ) : tenants.length === 0 ? (
              <EmptyState inline title="No tenants found" />
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Client</TH>
                    <TH>Status</TH>
                    <TH>Plan</TH>
                    <TH>Locations</TH>
                    <TH>Last activity</TH>
                    <TH>Created</TH>
                    <TH>Actions</TH>
                  </TR>
                </THead>
                <TBody>
                  {tenants.map((tenant) => (
                    <TR key={tenant.tenant_id}>
                      <TD>
                        <div className="font-semibold">{tenant.business_name}</div>
                        <p className="text-xs text-muted-foreground">{tenant.tenant_id}</p>
                      </TD>
                      <TD>
                        <Badge variant={statusVariant(tenant.status)} className="capitalize">
                          {tenant.status}
                        </Badge>
                      </TD>
                      <TD className="capitalize">{tenant.plan_name ?? "—"}</TD>
                      <TD>
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-primary" />
                          <span>{tenant.location_limit ?? "—"}</span>
                        </div>
                      </TD>
                      <TD>{timeAgo(tenant.last_activity)}</TD>
                      <TD>{formatDate(tenant.created_at)}</TD>
                      <TD>
                        <div className="flex flex-wrap gap-2 text-xs">
                          <Button variant="outline" size="sm" onClick={() => openDetail(tenant.tenant_id)}>
                            <Eye className="h-4 w-4" />
                            View
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleImpersonate(tenant.tenant_id)}>
                            <Shield className="h-4 w-4" />
                            Impersonate
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setTerminateId(tenant.tenant_id)}>
                            <Ban className="h-4 w-4" />
                            Terminate
                          </Button>
                        </div>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
            <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
              <span>
                Page {page} / {totalPages}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  Prev
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                  Next
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Sheet
        open={Boolean(detailId)}
        onOpenChange={(open) => {
          if (!open) {
            setDetailId(null);
            setDetail(null);
          }
        }}
        title="Tenant detail"
        description="Plan, locations, connections, billing events"
      >
        {detailLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : !detail ? (
          <EmptyState inline title="Select a tenant" />
        ) : (
          <div className="space-y-4 text-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-lg font-semibold">{detail.tenant?.business_name}</p>
                <p className="text-xs text-muted-foreground">{detail.tenant?.tenant_id}</p>
              </div>
              <Badge variant="muted">{detail.tenant?.plan_name ?? "—"}</Badge>
            </div>
            <div className="grid gap-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Locations</p>
              {detail.locations?.length ? (
                detail.locations.map((loc: Location) => (
                  <div key={loc.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                    <div>
                      <p className="font-semibold">{loc.name}</p>
                      <p className="text-xs text-muted-foreground">{loc.gbp_location_id ?? "no GBP id"}</p>
                    </div>
                    <Badge variant={loc.is_active ? "success" : "muted"}>{loc.is_active ? "Active" : "Inactive"}</Badge>
                  </div>
                ))
              ) : (
                <EmptyState inline title="No locations" />
              )}
            </div>
            <Section title="Connections" items={detail.connections} />
            <Section title="Recent posts" items={detail.posts} />
            <Section title="Review requests" items={detail.reviews} />
            <Section title="Billing events" items={detail.audits} />
          </div>
        )}
      </Sheet>

      <Dialog
        open={Boolean(terminateId)}
        onOpenChange={(open) => !open && setTerminateId(null)}
        title="Terminate account"
        description="Placeholder action — implement backend to cancel subscription and disable automations."
      >
        <p className="text-sm text-muted-foreground">This will be logged to audit and disable client access.</p>
        <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-3">
          <Button variant="ghost" onClick={() => setTerminateId(null)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={() => setTerminateId(null)}>
            Terminate
          </Button>
        </div>
      </Dialog>
    </AdminShell>
  );
}

function Section({ title, items }: { title: string; items?: unknown[] }) {
  return (
    <div className="space-y-2">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{title}</p>
      {items && items.length ? (
        <div className="space-y-2">
          {items.map((item, idx) => {
            const record = item as Record<string, unknown>;
            return (
              <div key={(record.id as string) ?? idx} className="rounded-lg border border-border bg-white/60 px-3 py-2">
                <p className="font-semibold">
                  {(record.subject as string) ?? (record.title as string) ?? (record.event_type as string) ?? "Item"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDate((record.created_at as string) ?? (record.published_at as string))}
                </p>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState inline title="No data" />
      )}
    </div>
  );
}

function statusVariant(status?: string) {
  switch (status) {
    case "active":
      return "success";
    case "past_due":
      return "warning";
    case "churned":
    case "canceled":
      return "danger";
    default:
      return "muted";
  }
}

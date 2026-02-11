"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { adminApi } from "@/lib/adminApiClient";
import { formatDate } from "@/lib/date-utils";

type Subscription = {
  tenant_id: string;
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
  status?: string;
  plan?: string;
  location_limit?: number;
  current_period_end?: string;
};

export default function BillingPage() {
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updateId, setUpdateId] = useState<string | null>(null);
  const [newPlan, setNewPlan] = useState("pro");
  const [locationLimit, setLocationLimit] = useState(3);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await adminApi.billing();
        if (!active) return;
        setSubs(data.rows ?? []);
      } catch (err: unknown) {
        if (!active) return;
        const message = err instanceof Error ? err.message : "Failed to load billing";
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
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Billing</p>
            <h1 className="text-2xl font-semibold">Subscriptions & plans</h1>
          </div>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Subscriptions</CardTitle>
              <CardDescription>Change plan, update location limit, cancel</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-48 w-full" />
            ) : error ? (
              <EmptyState inline title="Could not load billing" description={error} />
            ) : subs.length === 0 ? (
              <EmptyState inline title="No subscriptions" />
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Tenant</TH>
                    <TH>Status</TH>
                    <TH>Plan</TH>
                    <TH>Location limit</TH>
                    <TH>Renews</TH>
                    <TH>Actions</TH>
                  </TR>
                </THead>
                <TBody>
                  {subs.map((sub) => (
                    <TR key={sub.stripe_subscription_id ?? sub.tenant_id}>
                      <TD>
                        <div className="font-semibold">{sub.tenant_id}</div>
                        <p className="text-xs text-muted-foreground">{sub.stripe_customer_id}</p>
                      </TD>
                      <TD>
                        <Badge variant={statusVariant(sub.status)} className="capitalize">
                          {sub.status ?? "unknown"}
                        </Badge>
                      </TD>
                      <TD className="capitalize">{sub.plan ?? "—"}</TD>
                      <TD>{sub.location_limit ?? "—"}</TD>
                      <TD>{formatDate(sub.current_period_end)}</TD>
                      <TD>
                        <div className="flex flex-wrap gap-2 text-xs">
                          <Button variant="outline" size="sm" onClick={() => setUpdateId(sub.tenant_id)}>
                            Update
                          </Button>
                          <Button variant="ghost" size="sm">
                            Cancel (placeholder)
                          </Button>
                        </div>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Failed payment handling</CardTitle>
            <CardDescription>Grace period, pause automations, notify client</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3 text-sm">
            <div className="rounded-lg border border-border bg-white/60 px-3 py-2">
              <p className="font-semibold">Grace period</p>
              <p className="text-xs text-muted-foreground">Placeholder UI</p>
            </div>
            <div className="rounded-lg border border-border bg-white/60 px-3 py-2">
              <p className="font-semibold">Pause automations</p>
              <p className="text-xs text-muted-foreground">Toggle when past due</p>
            </div>
            <div className="rounded-lg border border-border bg-white/60 px-3 py-2">
              <p className="font-semibold">Notify client</p>
              <p className="text-xs text-muted-foreground">Send email/SMS (placeholder)</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={Boolean(updateId)}
        onOpenChange={(open) => !open && setUpdateId(null)}
        title="Update subscription"
        description="Change plan and location amount selection (placeholder)"
      >
        <div className="space-y-3">
          <Select
            value={newPlan}
            onChange={(e) => setNewPlan(e.target.value)}
            options={[
              { label: "Starter", value: "starter" },
              { label: "Pro", value: "pro" },
              { label: "Agency", value: "agency" },
            ]}
          />
          <div>
            <p className="text-sm font-semibold">Location limit</p>
            <div className="mt-2 flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setLocationLimit((n) => Math.max(1, n - 1))}>
                -
              </Button>
              <span className="w-10 text-center text-sm font-semibold">{locationLimit}</span>
              <Button variant="outline" size="sm" onClick={() => setLocationLimit((n) => n + 1)}>
                +
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Location amount selection UI only.</p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-3">
          <Button variant="ghost" onClick={() => setUpdateId(null)}>
            Cancel
          </Button>
          <Button onClick={() => setUpdateId(null)}>Save (placeholder)</Button>
        </div>
      </Dialog>
    </AdminShell>
  );
}

function statusVariant(status?: string) {
  switch (status) {
    case "active":
      return "success";
    case "past_due":
      return "warning";
    case "canceled":
    case "churned":
      return "danger";
    default:
      return "muted";
  }
}

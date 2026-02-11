"use client";

import { useEffect, useMemo, useState } from "react";
import { Send, Filter, Phone, Mail } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs } from "@/components/ui/tabs";
import { useTenant } from "@/lib/tenant-context";
import { listReviewRequests } from "@/lib/db";
import { format } from "@/lib/date-utils";

const statusTabs = [
  { value: "all", label: "All" },
  { value: "sent", label: "Sent" },
  { value: "opened", label: "Opened" },
  { value: "completed", label: "Completed" },
  { value: "review_left", label: "Review left" },
];

export default function ReviewsPage() {
  const { tenantId, selectedLocationId, refresh: refreshTenant } = useTenant();
  const [requests, setRequests] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [statusFilter, setStatusFilter] = useState("all");
  const [sendModal, setSendModal] = useState(false);
  const [resendAfterDays, setResendAfterDays] = useState(7);

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
        const data = await listReviewRequests(tenantId, selectedLocationId ?? undefined, { limit: 50 });
        if (!active) return;
        setRequests((data ?? []) as Array<Record<string, unknown>>);
      } catch (err: unknown) {
        if (!active) return;
        const message = err instanceof Error ? err.message : "Failed to load review requests";
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

  const filtered = useMemo(() => {
    if (statusFilter === "all") return requests;
    return requests.filter((req) => req.status === statusFilter);
  }, [requests, statusFilter]);

  return (
    <DashboardShell onRefresh={handleRefresh}>
      <div className="space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Review monitoring</p>
            <h1 className="text-2xl font-semibold">Send, track, and nudge reviews</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleRefresh}>
              Refresh
            </Button>
            <Button onClick={() => setSendModal(true)}>
              <Send className="mr-2 h-4 w-4" />
              Send request
            </Button>
          </div>
        </header>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Requests</CardTitle>
              <CardDescription>Track delivery status and completions</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Tabs tabs={statusTabs} value={statusFilter} onValueChange={setStatusFilter} />
              <Badge variant="outline" className="capitalize">
                {selectedLocationId ? "Filtered" : "All locations"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-40 w-full" />
            ) : error ? (
              <EmptyState inline title="Failed to load" description={error} />
            ) : filtered.length === 0 ? (
              <EmptyState inline title="No requests yet" description="Send your first review request to see progress." />
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Customer</TH>
                    <TH>Status</TH>
                    <TH>Created</TH>
                    <TH>Last sent</TH>
                    <TH>Location</TH>
                  </TR>
                </THead>
                <TBody>
                  {filtered.map((req) => (
                    <TR key={req.id}>
                      <TD>
                        <div className="font-semibold">{req.customer_name ?? "—"}</div>
                        <p className="text-xs text-muted-foreground">{maskPhone(req.customer_phone)}</p>
                      </TD>
                      <TD>
                        <Badge variant={req.status === "review_left" || req.status === "completed" ? "success" : "muted"} className="capitalize">
                          {req.status ?? "sent"}
                        </Badge>
                      </TD>
                      <TD>{format(req.created_at)}</TD>
                      <TD>{format(req.last_sent_at)}</TD>
                      <TD>
                        <Badge variant="muted">{req.location_id ?? "All"}</Badge>
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
              <Filter className="h-5 w-5 text-primary" />
              <div>
                <CardTitle>Status automation</CardTitle>
                <CardDescription>Resend logic when a review is not completed</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span>Resend after (days)</span>
                <input
                  type="number"
                  min={3}
                  max={30}
                  value={resendAfterDays}
                  onChange={(e) => setResendAfterDays(Number(e.target.value))}
                  className="w-20 rounded-md border border-border px-2 py-1 text-right"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                This is a UI-only setting today; wire to your automation to retry if status != review_left.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>SMS & email templates</CardTitle>
              <CardDescription>Coming soon</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-2 text-foreground">
                <Phone className="h-4 w-4" /> SMS with short link and personalization
              </div>
              <div className="flex items-center gap-2 text-foreground">
                <Mail className="h-4 w-4" /> Email follow-up template
              </div>
              <div className="rounded-lg border border-dashed border-border bg-muted/40 p-3">
                Template editor will live here. For now, updates can be made in the backend or console.
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog
        open={sendModal}
        onOpenChange={setSendModal}
        title="Send review request"
        description="UI only — connect to your backend trigger"
      >
        <div className="space-y-3">
          <label className="text-sm">
            Customer name
            <input className="mt-1 w-full rounded-lg border border-border px-3 py-2" placeholder="Jane Smith" />
          </label>
          <label className="text-sm">
            Phone (E.164)
            <input className="mt-1 w-full rounded-lg border border-border px-3 py-2" placeholder="+15551234567" />
          </label>
          <label className="text-sm">
            Notes
            <textarea className="mt-1 w-full rounded-lg border border-border px-3 py-2" rows={3} placeholder="Service details" />
          </label>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-3">
          <Button variant="ghost" onClick={() => setSendModal(false)}>
            Cancel
          </Button>
          <Button onClick={() => setSendModal(false)}>Send</Button>
        </div>
      </Dialog>
    </DashboardShell>
  );
}

function maskPhone(phone?: string | null) {
  if (!phone) return "—";
  if (phone.length <= 4) return phone;
  return `${phone.slice(0, 2)}•••${phone.slice(-2)}`;
}

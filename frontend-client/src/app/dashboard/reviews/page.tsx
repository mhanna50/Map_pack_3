"use client";

import { useEffect, useMemo, useState } from "react";
import { Send, Filter, Phone, Mail } from "lucide-react";
import { DashboardShell } from "@/features/dashboard/components/shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs } from "@/components/ui/tabs";
import { useTenant } from "@/features/tenants/tenant-context";
import { listReviewRequests } from "@/lib/db";
import { format } from "@/lib/date-utils";
import { fetchBackendJson } from "@/lib/backend-api";

type ReviewRequest = {
  id: string | number;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_email?: string | null;
  contact?: {
    name?: string | null;
    phone?: string | null;
    email?: string | null;
  } | null;
  status?: string | null;
  created_at?: string | null;
  sent_at?: string | null;
  last_sent_at?: string | null;
  location_id?: string | null;
};

type ReviewProviderStatus = {
  provider: string;
  display_name: string;
  supports_sync: boolean;
  supports_reply: boolean;
  requirements: string[];
  configured: boolean;
  mapped_reviews: number;
  notes?: string | null;
};

type SyncProviderResult = {
  provider: string;
  status: string;
  count: number;
  message?: string | null;
};

const statusTabs = [
  { value: "all", label: "All" },
  { value: "sent", label: "Sent" },
  { value: "opened", label: "Opened" },
  { value: "completed", label: "Completed" },
  { value: "review_left", label: "Review left" },
];

export default function ReviewsPage() {
  const { tenantId, selectedLocationId, refresh: refreshTenant, supabase } = useTenant();
  const [requests, setRequests] = useState<ReviewRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [statusFilter, setStatusFilter] = useState("all");
  const [sendModal, setSendModal] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [resendAfterDays, setResendAfterDays] = useState(7);
  const [providers, setProviders] = useState<ReviewProviderStatus[]>([]);
  const [selectedProvider, setSelectedProvider] = useState("google");
  const [syncingProvider, setSyncingProvider] = useState(false);
  const [providerMessage, setProviderMessage] = useState<string | null>(null);

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
        const [data, providerRows] = await Promise.all([
          listReviewRequests(tenantId, selectedLocationId ?? undefined, { limit: 50 }),
          fetchBackendJson<ReviewProviderStatus[]>(
            "/reviews/providers",
            {
              query: {
                organization_id: tenantId,
                location_id: selectedLocationId ?? undefined,
              },
            },
            supabase,
          ),
        ]);
        if (!active) return;
        setRequests((data ?? []) as ReviewRequest[]);
        setProviders(providerRows ?? []);
        setSelectedProvider((currentProvider) =>
          providerRows?.some((provider) => provider.provider === currentProvider)
            ? currentProvider
            : providerRows?.[0]?.provider ?? "google",
        );
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
  }, [tenantId, selectedLocationId, refreshKey, supabase]);

  const filtered = useMemo(() => {
    if (statusFilter === "all") return requests;
    return requests.filter((req) => req.status === statusFilter);
  }, [requests, statusFilter]);

  const activeProvider = useMemo(
    () => providers.find((provider) => provider.provider === selectedProvider) ?? providers[0] ?? null,
    [providers, selectedProvider],
  );

  const connectedCount = useMemo(
    () => providers.filter((provider) => provider.configured).length,
    [providers],
  );

  const handleSyncProvider = async () => {
    if (!tenantId || !selectedLocationId || !activeProvider) {
      setProviderMessage("Select a location before syncing reviews.");
      return;
    }
    setSyncingProvider(true);
    setProviderMessage(null);
    try {
      const results = await fetchBackendJson<SyncProviderResult[]>(
        "/reviews/sync",
        {
          method: "POST",
          query: {
            organization_id: tenantId,
            location_id: selectedLocationId,
            provider: activeProvider.provider,
          },
        },
        supabase,
      );
      const result = results[0];
      setProviderMessage(
        result?.status === "synced"
          ? `${activeProvider.display_name}: synced ${result.count} review${result.count === 1 ? "" : "s"}.`
          : result?.message ?? `${activeProvider.display_name}: ${result?.status ?? "not configured"}.`,
      );
      setRefreshKey((key) => key + 1);
    } catch (err) {
      setProviderMessage(err instanceof Error ? err.message : "Unable to sync provider");
    } finally {
      setSyncingProvider(false);
    }
  };

  const handleSendRequest = async () => {
    if (!tenantId) {
      setSendError("No tenant selected.");
      return;
    }
    setSending(true);
    setSendError(null);
    try {
      await fetchBackendJson<ReviewRequest>(
        "/review-requests/",
        {
          method: "POST",
          body: JSON.stringify({
            organization_id: tenantId,
            location_id: selectedLocationId,
            customer_name: customerName.trim(),
            customer_phone: customerPhone.trim(),
            notes: notes.trim() || undefined,
            channel: "sms",
          }),
        },
        supabase,
      );
      setCustomerName("");
      setCustomerPhone("");
      setNotes("");
      setSendModal(false);
      setRefreshKey((key) => key + 1);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Unable to send review request");
    } finally {
      setSending(false);
    }
  };

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
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>Review sources</CardTitle>
              <CardDescription>Connected providers and API readiness</CardDescription>
            </div>
            <Badge variant={connectedCount > 0 ? "success" : "warning"}>
              {connectedCount}/{providers.length || 10} connected
            </Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
              <label className="text-sm">
                Provider
                <select
                  value={selectedProvider}
                  onChange={(event) => {
                    setSelectedProvider(event.target.value);
                    setProviderMessage(null);
                  }}
                  className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2"
                >
                  {providers.length === 0 ? (
                    <option value="google">Google Business Profile</option>
                  ) : (
                    providers.map((provider) => (
                      <option key={provider.provider} value={provider.provider}>
                        {provider.display_name} - {provider.configured ? "connected" : "not connected"}
                      </option>
                    ))
                  )}
                </select>
              </label>
              <div className="flex items-end">
                <Button
                  onClick={handleSyncProvider}
                  disabled={syncingProvider || !selectedLocationId || !activeProvider}
                >
                  {syncingProvider ? "Syncing..." : "Sync selected"}
                </Button>
              </div>
            </div>

            {activeProvider && (
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{activeProvider.display_name}</span>
                  <Badge variant={activeProvider.configured ? "success" : "warning"}>
                    {activeProvider.configured ? "Connected" : "Needs credentials"}
                  </Badge>
                  <Badge variant="muted">{activeProvider.mapped_reviews} reviews</Badge>
                  <Badge variant={activeProvider.supports_reply ? "success" : "muted"}>
                    {activeProvider.supports_reply ? "Replies supported" : "Replies pending"}
                  </Badge>
                </div>
                {!activeProvider.configured && (
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-muted-foreground">
                    {activeProvider.requirements.map((requirement) => (
                      <li key={requirement}>{requirement}</li>
                    ))}
                  </ul>
                )}
                {activeProvider.notes && <p className="mt-3 text-muted-foreground">{activeProvider.notes}</p>}
                {providerMessage && <p className="mt-3 font-medium text-foreground">{providerMessage}</p>}
              </div>
            )}
          </CardContent>
        </Card>

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
                  {filtered.map((req, index) => (
                    <TR key={req.id?.toString?.() ?? `req-${index}`}>
                      <TD>
                        <div className="font-semibold">{req.customer_name ?? req.contact?.name ?? "—"}</div>
                        <p className="text-xs text-muted-foreground">{maskPhone(req.customer_phone ?? req.contact?.phone)}</p>
                      </TD>
                      <TD>
                        <Badge variant={req.status === "review_left" || req.status === "completed" ? "success" : "muted"} className="capitalize">
                          {req.status ?? "sent"}
                        </Badge>
                      </TD>
                      <TD>{format(req.created_at)}</TD>
                      <TD>{format(req.last_sent_at ?? req.sent_at)}</TD>
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
        description="Send an SMS review request through Twilio."
      >
        <div className="space-y-3">
          <label className="text-sm">
            Customer name
            <input
              className="mt-1 w-full rounded-lg border border-border px-3 py-2"
              placeholder="Jane Smith"
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
            />
          </label>
          <label className="text-sm">
            Phone (E.164)
            <input
              className="mt-1 w-full rounded-lg border border-border px-3 py-2"
              placeholder="+15551234567"
              value={customerPhone}
              onChange={(event) => setCustomerPhone(event.target.value)}
            />
          </label>
          <label className="text-sm">
            Notes
            <textarea
              className="mt-1 w-full rounded-lg border border-border px-3 py-2"
              rows={3}
              placeholder="Service details"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
          {sendError && <p className="text-sm text-rose-600">{sendError}</p>}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-3">
          <Button variant="ghost" onClick={() => setSendModal(false)}>
            Cancel
          </Button>
          <Button onClick={handleSendRequest} disabled={sending || !customerName.trim() || !customerPhone.trim()}>
            {sending ? "Sending..." : "Send"}
          </Button>
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

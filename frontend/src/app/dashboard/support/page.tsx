"use client";

import { useEffect, useState } from "react";
import { LifeBuoy, MessageCircle } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useTenant } from "@/lib/tenant-context";
import { listSupportTickets } from "@/lib/db";
import { format } from "@/lib/date-utils";

type Ticket = { id?: string; tenant_id?: string; subject?: string; status?: string; created_at?: string };

export default function SupportPage() {
  const { tenantId, refresh: refreshTenant } = useTenant();
  const [tickets, setTickets] = useState<Ticket[]>([]);
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
        const data = await listSupportTickets(tenantId, { limit: 20 });
        if (!active) return;
        setTickets((data ?? []) as Ticket[]);
      } catch (err: unknown) {
        if (!active) return;
        const message = err instanceof Error ? err.message : "Failed to load tickets";
        setError(message);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [tenantId, refreshKey]);

  return (
    <DashboardShell onRefresh={handleRefresh}>
      <div className="space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Support</p>
            <h1 className="text-2xl font-semibold">Tickets & contact</h1>
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            Refresh
          </Button>
        </header>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Create ticket</CardTitle>
              <CardDescription>UI only — hook to support backend</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <label className="block">
                <span className="text-muted-foreground">Subject</span>
                <input className="mt-1 w-full rounded-lg border border-border px-3 py-2" placeholder="Need help with..." />
              </label>
              <label className="block">
                <span className="text-muted-foreground">Details</span>
                <textarea className="mt-1 w-full rounded-lg border border-border px-3 py-2" rows={3} placeholder="Describe the issue" />
              </label>
              <Button>Create ticket</Button>
              <p className="text-xs text-muted-foreground">This form is not wired; connect to your support API or Supabase table.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center gap-2">
              <LifeBuoy className="h-4 w-4 text-primary" />
              <div>
                <CardTitle>Contact support</CardTitle>
                <CardDescription>Fastest ways to reach us</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-primary" />
                Chat: Mon–Fri, 9a–6p PT
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Email: support@example.com
              </div>
              <div className="rounded-lg border border-dashed border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                Add phone number or SLA notes here. We can also expose status page links.
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Existing tickets</CardTitle>
            <CardDescription>Most recent 20</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-32 w-full" />
            ) : error ? (
              <EmptyState inline title="Could not load tickets" description={error} />
            ) : tickets.length === 0 ? (
              <EmptyState inline title="No tickets yet" description="Create one if you need help." />
            ) : (
              <div className="space-y-2">
                {tickets.map((ticket) => (
                  <div key={ticket.id} className="flex items-center justify-between rounded-lg border border-border bg-white/60 px-3 py-2 text-sm">
                    <div>
                      <p className="font-semibold">{ticket.subject ?? "Support ticket"}</p>
                      <p className="text-xs text-muted-foreground">{format(ticket.created_at)}</p>
                    </div>
                    <Badge variant={ticket.status === "open" ? "warning" : "success"} className="capitalize">
                      {ticket.status ?? "open"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AdminShell } from "@/features/admin/components/shell";
import { adminApi } from "@/features/admin/adminApiClient";
import { AdminFilterBar, AdminFilters, AdminModuleTable, AdminStatCard, statusBadge } from "@/features/admin/components/monitoring";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/date-utils";

export default function AdminLeadRecoveryPage() {
  const [filters, setFilters] = useState<AdminFilters>({ range: "30d" });
  const [stats, setStats] = useState<Record<string, unknown>>({});
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [clients, setClients] = useState<Array<{ tenant_id?: string; business_name?: string }>>([]);
  const [leadDetail, setLeadDetail] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [leadData, clientRows] = await Promise.all([
          adminApi.monitoringLeadRecovery(filters),
          adminApi.monitoringClients({ range: filters.range }),
        ]);
        if (!active) return;
        setStats((leadData.stats ?? {}) as Record<string, unknown>);
        setRows((leadData.rows ?? []) as Array<Record<string, unknown>>);
        setClients((clientRows.rows ?? []) as Array<{ tenant_id?: string; business_name?: string }>);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Unable to load Lead Recovery monitoring");
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [filters]);

  const openLead = async (leadId: string) => {
    setLeadDetail(await adminApi.monitoringLeadDetail(leadId));
  };

  const deepLink = async (tenantId: string) => {
    const result = await adminApi.impersonateDeepLink(tenantId, "/dashboard/lead-recovery", "lead_recovery");
    const clientBase = (process.env.NEXT_PUBLIC_CLIENT_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
    window.open(`${clientBase}${result.targetPath}`, "_blank", "noopener,noreferrer");
  };

  const statCards = [
    ["Missed calls", "missed_calls"],
    ["Auto text-backs", "textbacks"],
    ["Customer responses", "customer_responses"],
    ["Qualified leads", "qualified_leads"],
    ["Owner notifications", "owner_notifications"],
    ["Booked", "booked_leads"],
    ["Lost", "lost_leads"],
    ["Completed", "completed_leads"],
    ["Response rate", "response_rate"],
    ["Booking rate", "booking_rate"],
    ["Needs follow-up", "needs_follow_up"],
    ["Forwarding not configured", "forwarding_not_configured"],
  ];

  return (
    <AdminShell>
      <div className="space-y-5">
        <header>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Module monitoring</p>
          <h1 className="text-2xl font-semibold">Lead Recovery</h1>
          <p className="text-sm text-muted-foreground">Missed calls, text-back intake, qualified leads, owner notifications, and stuck follow-up.</p>
        </header>
        <AdminFilterBar filters={filters} onChange={setFilters} clients={clients} showStatus />
        {error ? (
          <EmptyState inline title="Could not load Lead Recovery" description={error} />
        ) : loading ? (
          <Skeleton className="h-96 w-full" />
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-4">
              {statCards.map(([label, key]) => (
                <AdminStatCard key={key} label={label} value={key.includes("rate") ? `${stats[key] ?? 0}%` : stats[key]} tone={Number(stats[key] ?? 0) > 0 && key.includes("not_configured") ? "warning" : "default"} />
              ))}
            </div>
            <Card>
              <CardHeader>
                <CardTitle>Recovered leads</CardTitle>
                <CardDescription>Admin-only lead inbox across selected clients</CardDescription>
              </CardHeader>
              <CardContent>
                <AdminModuleTable
                  rows={rows}
                  columns={[
                    { key: "client", label: "Client" },
                    { key: "customer_phone", label: "Lead phone" },
                    { key: "source", label: "Source" },
                    { key: "status", label: "Status", render: (row) => statusBadge(row.status) },
                    { key: "urgency", label: "Urgency" },
                    { key: "service_requested", label: "Service" },
                    { key: "location", label: "Location" },
                    { key: "last_message_at", label: "Last message", render: (row) => formatDate(String(row.last_message_at ?? row.created_at ?? "")) },
                    { key: "owner_notified", label: "Owner notified", render: (row) => row.owner_notified ? "Yes" : "No" },
                    { key: "booked", label: "Booked", render: (row) => row.booked ? "Yes" : "No" },
                  ]}
                  actions={(row) => (
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => openLead(String(row.id))}>View lead</Button>
                      <Link className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold" href={`/admin/clients/${String(row.tenant_id)}`}>Client</Link>
                      <Button size="sm" variant="ghost" onClick={() => deepLink(String(row.tenant_id))}>Open client tab</Button>
                    </div>
                  )}
                />
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <Sheet open={Boolean(leadDetail)} onOpenChange={(open) => !open && setLeadDetail(null)} title="Lead detail" description="Conversation, extracted fields, owner notification status, and Twilio events">
        {leadDetail && <LeadDetail data={leadDetail} />}
      </Sheet>
    </AdminShell>
  );
}

function LeadDetail({ data }: { data: Record<string, unknown> }) {
  const lead = (data.lead ?? {}) as Record<string, unknown>;
  const messages = (data.messages ?? []) as Array<Record<string, unknown>>;
  const events = (data.events ?? []) as Array<Record<string, unknown>>;
  const notes = (data.notes ?? []) as Array<Record<string, unknown>>;
  return (
    <div className="space-y-4 text-sm">
      <div>
        <p className="text-lg font-semibold">{String(lead.customer_name ?? "Unknown customer")}</p>
        <p className="text-muted-foreground">{String(lead.customer_phone ?? "No phone")}</p>
      </div>
      <div className="grid gap-2">
        {["service_requested", "location", "urgency", "preferred_time", "details", "owner_summary"].map((key) => (
          <div key={key} className="rounded-lg border border-border p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{key.replaceAll("_", " ")}</p>
            <p className="mt-1 whitespace-pre-wrap">{String(lead[key] ?? "-")}</p>
          </div>
        ))}
      </div>
      <Section title="Conversation" rows={messages} primary="body" />
      <Section title="Twilio/events" rows={events} primary="event_type" />
      <Section title="Internal notes" rows={notes} primary="note" />
    </div>
  );
}

function Section({ title, rows, primary }: { title: string; rows: Array<Record<string, unknown>>; primary: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="mt-2 space-y-2">
        {rows.length === 0 ? <p className="text-muted-foreground">No data</p> : rows.map((row, index) => (
          <div key={String(row.id ?? index)} className="rounded-lg border border-border p-2">
            <p>{String(row[primary] ?? "-")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{formatDate(String(row.created_at ?? ""))}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

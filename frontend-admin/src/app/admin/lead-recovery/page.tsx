"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, AlertTriangle, CalendarCheck, CheckCircle2, PhoneCall, Target, Users, Wrench } from "lucide-react";
import { AdminShell } from "@/features/admin/components/shell";
import { adminApi } from "@/features/admin/adminApiClient";
import { AdminFilterBar, AdminFilters, statusBadge } from "@/features/admin/components/monitoring";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDate } from "@/lib/date-utils";

type Summary = {
  moduleHealth?: string;
  moduleHealthLabel?: string;
  moduleHealthDescription?: string;
  activeClients?: number;
  recoveredLeads?: number;
  bookedLeads?: number;
  needsAttention?: number;
};

type AttentionItem = {
  id?: string;
  severity?: string;
  title?: string;
  description?: string;
  count?: number;
  actionType?: string;
};

type ClientRow = {
  tenantId?: string;
  tenant_id?: string;
  businessName?: string;
  health?: string;
  setupStatus?: string;
  missedCalls?: number;
  leadsQualified?: number;
  bookedLeads?: number;
  needsFollowUp?: number;
  lastActivityAt?: string | null;
  openIssuesCount?: number;
};

type ActivityRow = {
  id?: string;
  tenantId?: string;
  tenant_id?: string;
  businessName?: string;
  title?: string;
  leadLabel?: string | null;
  status?: string;
  createdAt?: string;
  created_at?: string;
  leadId?: string | null;
};

type LogRow = {
  id?: string;
  severity?: string;
  integration?: string;
  module?: string;
  message?: string;
  created_at?: string;
  tenant_id?: string | null;
  client?: string;
};

const volumeMetrics = [
  ["Missed Calls", "missed_calls", "Calls routed into Lead Recovery"],
  ["Text-backs Sent", "textbacks", "Outbound missed-call SMS"],
  ["Caller Replies", "customer_responses", "Inbound SMS responses"],
  ["Leads Qualified", "qualified_leads", "Qualified in selected range"],
] as const;

const conversionMetrics = [
  ["Booked Leads", "booked_leads", "Marked booked by owners"],
  ["Lost Leads", "lost_leads", "Marked lost"],
  ["Completed Jobs", "completed_leads", "Marked completed"],
  ["Response Rate", "response_rate", "Caller replies / missed calls"],
  ["Booking Rate", "booking_rate", "Booked or completed / qualified"],
] as const;

const operationsMetrics = [
  ["Owner Alerts Sent", "owner_notifications", "Owner notification events"],
  ["Leads Needing Follow-Up", "needs_follow_up", "Waiting for next action"],
  ["Setup Issues", "forwarding_not_configured", "Forwarding not verified"],
  ["Twilio Failures", "twilio_failures", "Open Twilio incidents"],
  ["Webhook Failures", "webhook_failures", "Open webhook incidents"],
] as const;

export default function AdminLeadRecoveryPage() {
  const [filters, setFilters] = useState<AdminFilters>({ range: "30d" });
  const [stats, setStats] = useState<Record<string, unknown>>({});
  const [summary, setSummary] = useState<Summary>({});
  const [attentionItems, setAttentionItems] = useState<AttentionItem[]>([]);
  const [clientRows, setClientRows] = useState<ClientRow[]>([]);
  const [recentActivity, setRecentActivity] = useState<ActivityRow[]>([]);
  const [logsPreview, setLogsPreview] = useState<LogRow[]>([]);
  const [noClientsEnabled, setNoClientsEnabled] = useState(false);
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
        const [leadData, clientData] = await Promise.all([
          adminApi.monitoringLeadRecovery(filters),
          adminApi.monitoringClients({ range: filters.range }),
        ]);
        if (!active) return;
        setStats((leadData.stats ?? {}) as Record<string, unknown>);
        setSummary((leadData.summary ?? {}) as Summary);
        setAttentionItems((leadData.attentionItems ?? []) as AttentionItem[]);
        setClientRows((leadData.clientRows ?? []) as ClientRow[]);
        setRecentActivity((leadData.recentActivity ?? []) as ActivityRow[]);
        setLogsPreview((leadData.logsPreview ?? []) as LogRow[]);
        setNoClientsEnabled(Boolean(leadData.noClientsEnabled));
        setClients((clientData.rows ?? []) as Array<{ tenant_id?: string; business_name?: string }>);
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

  const allStatsZero = useMemo(() => {
    const keys = [...volumeMetrics, ...conversionMetrics, ...operationsMetrics].map(([, key]) => key);
    return keys.every((key) => Number(stats[key] ?? 0) === 0);
  }, [stats]);

  return (
    <AdminShell>
      <div className="space-y-5">
        <header className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Lead Recovery</h1>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Monitor missed calls, text-back intake, qualified leads, owner alerts, booking outcomes, and setup issues across clients.
            </p>
          </div>
          <HealthBadge health={summary.moduleHealth} label={summary.moduleHealthLabel} />
        </header>

        <AdminFilterBar
          filters={filters}
          onChange={setFilters}
          clients={clients}
          showStatus
          showReset
          searchPlaceholder="Search clients, leads, phone, service..."
        />

        {error ? (
          <EmptyState inline title="Could not load Lead Recovery" description={error} />
        ) : loading ? (
          <Skeleton className="h-96 w-full" />
        ) : (
          <>
            {allStatsZero && (
              <EmptyState
                inline
                title="No lead recovery activity yet"
                description="Once clients finish forwarding setup and missed calls are detected, recovered leads and booking activity will appear here."
              />
            )}

            {noClientsEnabled && (
              <EmptyState
                inline
                title="No clients have Lead Recovery active yet"
                description="Clients will appear here after setup is enabled or verified."
              />
            )}

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5" aria-label="Lead Recovery health summary">
              <SummaryCard icon={Activity} label="Module Health" value={summary.moduleHealthLabel ?? "No activity yet"} description={summary.moduleHealthDescription ?? "No lead recovery activity yet"} tone={summary.moduleHealth} />
              <SummaryCard icon={Users} label="Active Clients" value={summary.activeClients ?? 0} description="Using missed-call recovery" />
              <SummaryCard icon={Target} label="Recovered Leads" value={summary.recoveredLeads ?? 0} description="Qualified in selected date range" />
              <SummaryCard icon={CalendarCheck} label="Booked Leads" value={summary.bookedLeads ?? 0} description="Marked booked by owners" />
              <SummaryCard icon={AlertTriangle} label="Needs Attention" value={summary.needsAttention ?? 0} description="Issues to review" tone={Number(summary.needsAttention ?? 0) > 0 ? "warning" : "healthy"} />
            </section>

            <AttentionNeeded items={attentionItems} allStatsZero={allStatsZero} />

            <section className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold">Performance Overview</h2>
                <p className="text-sm text-muted-foreground">Operational metrics grouped by lead volume, conversion, and delivery/setup work.</p>
              </div>
              <MetricGroup title="Lead Volume" metrics={volumeMetrics} stats={stats} />
              <MetricGroup title="Conversion" metrics={conversionMetrics} stats={stats} />
              <MetricGroup title="Operations" metrics={operationsMetrics} stats={stats} />
            </section>

            <ClientBreakdown rows={clientRows} onOpenClient={deepLink} />

            <RecentLeadActivity rows={recentActivity} onOpenLead={openLead} />

            <LogsPreview rows={logsPreview} />
          </>
        )}
      </div>

      <Sheet open={Boolean(leadDetail)} onOpenChange={(open) => !open && setLeadDetail(null)} title="Lead detail" description="Conversation, extracted fields, owner notification status, and Twilio events">
        {leadDetail && <LeadDetail data={leadDetail} />}
      </Sheet>
    </AdminShell>
  );
}

function SummaryCard({ icon: Icon, label, value, description, tone = "default" }: { icon: typeof Activity; label: string; value: unknown; description: string; tone?: string }) {
  const toneClass = tone === "critical" ? "border-rose-200" : tone === "warning" ? "border-amber-200" : tone === "healthy" ? "border-emerald-200" : "";
  return (
    <Card className={`h-full ${toneClass}`}>
      <CardContent className="flex min-h-32 items-center gap-4 p-5 sm:p-5">
        <div className="rounded-lg bg-muted p-2 text-muted-foreground">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-semibold capitalize">{String(value)}</p>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function AttentionNeeded({ items, allStatsZero }: { items: AttentionItem[]; allStatsZero: boolean }) {
  const visibleItems = items.filter((item) => Number(item.count ?? 0) > 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Attention Needed</CardTitle>
        <CardDescription>Prioritized setup, lead follow-up, and delivery issues for the selected filters.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {visibleItems.length === 0 ? (
          <EmptyState
            inline
            title={allStatsZero ? "No lead recovery activity yet" : "Nothing needs attention right now"}
            description={
              allStatsZero
                ? "Once clients finish forwarding setup and missed calls are detected, recovered leads and booking activity will appear here."
                : "Lead Recovery is running normally for the selected filters."
            }
          />
        ) : (
          visibleItems.map((item) => (
            <div key={String(item.id ?? item.title)} className="flex flex-col gap-3 rounded-lg border border-border p-4 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={severityVariant(item.severity)}>{labelize(item.severity ?? "info")}</Badge>
                  <p className="font-semibold">{String(item.title ?? "Issue")}</p>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{String(item.description ?? "")}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-2xl font-semibold">{Number(item.count ?? 0)}</span>
                <Button size="sm" variant="outline">{String(item.actionType ?? "Review")}</Button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function MetricGroup({ title, metrics, stats }: { title: string; metrics: readonly (readonly [string, string, string])[]; stats: Record<string, unknown> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {metrics.map(([label, key, description]) => (
          <div key={key} className="rounded-lg border border-border p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-semibold">{key.includes("rate") ? `${Number(stats[key] ?? 0)}%` : Number(stats[key] ?? 0)}</p>
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ClientBreakdown({ rows, onOpenClient }: { rows: ClientRow[]; onOpenClient: (tenantId: string) => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Client Breakdown</CardTitle>
        <CardDescription>Setup status, health, and lead outcomes by client.</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState inline title="No results match these filters" description="Try adjusting the client, status, date range, or search." />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Client / Business</TH>
                <TH>Health</TH>
                <TH>Setup Status</TH>
                <TH>Missed Calls</TH>
                <TH>Leads Qualified</TH>
                <TH>Booked</TH>
                <TH>Needs Follow-Up</TH>
                <TH>Last Activity</TH>
                <TH>Actions</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((row) => {
                const tenantId = String(row.tenantId ?? row.tenant_id ?? "");
                return (
                  <TR key={tenantId}>
                    <TD>
                      <div className="font-semibold">{row.businessName ?? "Client"}</div>
                      <p className="text-xs text-muted-foreground">{tenantId}</p>
                    </TD>
                    <TD><HealthBadge health={row.health} /></TD>
                    <TD>{statusBadge(row.setupStatus ?? "disabled")}</TD>
                    <TD>{row.missedCalls ?? 0}</TD>
                    <TD>{row.leadsQualified ?? 0}</TD>
                    <TD>{row.bookedLeads ?? 0}</TD>
                    <TD>{row.needsFollowUp ?? 0}</TD>
                    <TD>{row.lastActivityAt ? formatDate(row.lastActivityAt) : "No activity"}</TD>
                    <TD>
                      <div className="flex flex-wrap gap-2">
                        <Link className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold" href={`/admin/clients/${tenantId}`}>View Client Monitor</Link>
                        <Button size="sm" variant="outline" onClick={() => onOpenClient(tenantId)}>Impersonate</Button>
                        <Button size="sm" variant="ghost" onClick={() => onOpenClient(tenantId)}>Open Lead Recovery Tab</Button>
                      </div>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function RecentLeadActivity({ rows, onOpenLead }: { rows: ActivityRow[]; onOpenLead: (leadId: string) => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Lead Activity</CardTitle>
        <CardDescription>Latest missed calls, text-backs, replies, qualification, alerts, and booking changes.</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState inline title="No recent lead activity" description="Missed calls, replies, and lead updates will appear here as they happen." />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Time</TH>
                <TH>Client</TH>
                <TH>Event</TH>
                <TH>Lead / Customer</TH>
                <TH>Status</TH>
                <TH>Action</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((row) => (
                <TR key={String(row.id)}>
                  <TD>{formatDate(String(row.createdAt ?? row.created_at ?? ""))}</TD>
                  <TD>{row.businessName ?? "Client"}</TD>
                  <TD>{row.title ?? "Activity"}</TD>
                  <TD>{row.leadLabel ?? "Masked/unknown"}</TD>
                  <TD>{statusBadge(row.status ?? "completed")}</TD>
                  <TD>
                    {row.leadId ? (
                      <Button size="sm" variant="outline" onClick={() => onOpenLead(String(row.leadId))}>View lead</Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">No lead</span>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function LogsPreview({ rows }: { rows: LogRow[] }) {
  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle>Integration & Error Logs</CardTitle>
          <CardDescription>Twilio, webhook, delivery, notification, and setup issues connected to Lead Recovery.</CardDescription>
        </div>
        <Link className="inline-flex items-center rounded-lg border border-border px-3 py-2 text-sm font-semibold" href="/admin/integration-health">Open Health Center</Link>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState inline title="No Lead Recovery integration issues" description="Twilio and webhook issues will appear here when health monitoring records them." />
        ) : (
          <div className="space-y-2">
            {rows.map((row) => (
              <div key={String(row.id)} className="flex flex-col gap-2 rounded-lg border border-border p-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={severityVariant(row.severity)}>{labelize(row.severity ?? "warning")}</Badge>
                    <p className="font-semibold">{row.message ?? "Lead Recovery integration issue"}</p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{row.client ?? "Platform-wide"} · {row.integration ?? "twilio"} · {row.module ?? "lead_recovery"}</p>
                </div>
                <p className="text-xs text-muted-foreground">{formatDate(String(row.created_at ?? ""))}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function HealthBadge({ health, label }: { health?: string; label?: string }) {
  const normalized = String(health ?? "no_activity");
  const Icon = normalized === "healthy" ? CheckCircle2 : normalized === "critical" ? AlertTriangle : normalized === "warning" ? Wrench : PhoneCall;
  return (
    <Badge variant={healthVariant(normalized)} className="w-fit capitalize">
      <Icon className="h-3.5 w-3.5" />
      {label ?? normalized.replaceAll("_", " ")}
    </Badge>
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
        <p className="text-muted-foreground">{maskPhone(String(lead.customer_phone ?? ""))}</p>
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

function healthVariant(health: string) {
  if (health === "healthy") return "success";
  if (health === "critical") return "danger";
  if (health === "warning") return "warning";
  return "muted";
}

function severityVariant(severity?: string) {
  if (severity === "critical") return "danger";
  if (severity === "warning") return "warning";
  if (severity === "info") return "muted";
  return "muted";
}

function labelize(value: string) {
  return value.replaceAll("_", " ");
}

function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return phone ? "Masked phone" : "No phone";
  return `•••-•••-${digits.slice(-4)}`;
}

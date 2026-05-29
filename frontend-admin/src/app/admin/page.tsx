"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, AlertTriangle, CheckCircle2, ClipboardList, Gauge, PlugZap, RefreshCw, Siren, Users, Wrench } from "lucide-react";
import { AdminShell } from "@/features/admin/components/shell";
import { adminApi } from "@/features/admin/adminApiClient";
import { AdminActivityTimeline, AdminFilterBar, AdminFilters, statusBadge } from "@/features/admin/components/monitoring";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDate } from "@/lib/date-utils";

type OverviewPayload = {
  stats?: Record<string, number | string | null>;
  module_health?: Array<Record<string, unknown>>;
  recent_activity?: Array<Record<string, unknown>>;
  attention?: Array<Record<string, unknown>>;
};

type ClientRow = {
  tenant_id?: string;
  business_name?: string;
  subscription_status?: string;
  client_stage?: string;
  active_modules?: string[];
  open_issues?: string[];
  last_activity?: string;
  mrr?: number | string | null;
};

const activityMetrics = [
  ["Recent Posts", "recent_posts", "GBP and content activity"],
  ["Review Requests", "recent_review_requests", "Outbound review asks"],
  ["Gathered Reviews", "recent_reviews", "Reviews pulled from sources"],
  ["Recovered Leads", "recent_leads", "Lead Recovery leads"],
  ["Owner Notifications", "recent_owner_notifications", "Lead Recovery alerts"],
] as const;

const operationsMetrics = [
  ["Failed Jobs", "failed_jobs", "Background job failures"],
  ["Open Alerts", "open_alerts", "Operational alerts"],
  ["Critical Incidents", "active_critical_incidents", "Integration Health"],
  ["Warning Incidents", "active_warning_incidents", "Integration Health"],
  ["Reconnect Needed", "clients_needing_reconnect", "Client action required"],
] as const;

export default function AdminOverviewPage() {
  const [filters, setFilters] = useState<AdminFilters>({ range: "30d" });
  const [data, setData] = useState<OverviewPayload | null>(null);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [overview, clientRows] = await Promise.all([
          adminApi.monitoringOverview(filters),
          adminApi.monitoringClients({ ...filters, range: filters.range }),
        ]);
        if (!active) return;
        setData(overview as OverviewPayload);
        setClients((clientRows.rows ?? []) as ClientRow[]);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Unable to load monitoring overview");
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [filters, refreshKey]);

  const stats = useMemo(() => data?.stats ?? {}, [data?.stats]);
  const moduleHealth = useMemo(() => data?.module_health ?? [], [data?.module_health]);
  const attention = useMemo(() => data?.attention ?? [], [data?.attention]);
  const clientOptions = clients
    .filter((client) => !String(client.tenant_id ?? "").startsWith("prospective:"))
    .map((client) => ({ tenant_id: client.tenant_id, business_name: client.business_name }));

  const summary = useMemo(() => buildOverviewSummary(stats, attention, clients), [stats, attention, clients]);
  const clientsNeedingAttention = useMemo(() => clients.filter((client) => (client.open_issues ?? []).length > 0).slice(0, 12), [clients]);
  const allStatsZero = [...activityMetrics, ...operationsMetrics].every(([, key]) => Number(stats[key] ?? 0) === 0);

  return (
    <AdminShell>
      <div className="space-y-5">
        <header className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Platform Overview</h1>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Monitor client health, module activity, setup gaps, integration incidents, background jobs, and the next operational actions.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <HealthBadge health={summary.health} label={summary.healthLabel} />
            <Button variant="outline" size="sm" onClick={() => setRefreshKey((key) => key + 1)}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </div>
        </header>

        <AdminFilterBar
          filters={filters}
          onChange={setFilters}
          clients={clientOptions}
          showReset
          searchPlaceholder="Search clients..."
        />

        {error ? (
          <EmptyState inline title="Could not load monitoring data" description={error} />
        ) : loading ? (
          <Skeleton className="h-96 w-full" />
        ) : (
          <>
            {allStatsZero && clients.length === 0 && (
              <EmptyState
                inline
                title="No admin monitoring data yet"
                description="Clients, module activity, alerts, and integration health will appear here as the platform starts receiving activity."
              />
            )}

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5" aria-label="Platform health summary">
              <SummaryCard icon={Gauge} label="Platform Health" value={summary.healthLabel} description={summary.description} tone={summary.health} />
              <SummaryCard icon={Users} label="Active Clients" value={stats.active_clients ?? 0} description={`${stats.total_clients ?? 0} total clients`} />
              <SummaryCard icon={ClipboardList} label="Need Attention" value={stats.attention_clients ?? attention.length} description="Prioritized issues to review" tone={Number(stats.attention_clients ?? attention.length) ? "warning" : "healthy"} />
              <SummaryCard icon={PlugZap} label="Integration Issues" value={summary.integrationIssueCount} description="Critical, warning, failing, degraded" tone={summary.integrationIssueCount ? "warning" : "healthy"} />
              <SummaryCard icon={Activity} label="Recent Activity" value={summary.activityCount} description="Posts, reviews, leads, alerts" />
            </section>

            <PlatformHealthCallout stats={stats} />

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
              <AttentionPanel issues={attention} />
              <NextActions stats={stats} attentionCount={attention.length} />
            </div>

            <section className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold">Performance Overview</h2>
                <p className="text-sm text-muted-foreground">Activity and operational signals grouped by what they tell you.</p>
              </div>
              <MetricGroup title="Client Base" metrics={[
                ["Total Clients", "total_clients", "All clients in selected filters"],
                ["Active Clients", "active_clients", "Subscription/account active"],
                ["Still Onboarding", "onboarding_clients", "Pending setup"],
                ["Incomplete Setup", "incomplete_setup_clients", "Missing required module setup"],
                ["Billing/Integration Failures", "failed_integrations_clients", "Client-facing risk"],
              ]} stats={stats} />
              <MetricGroup title="Activity" metrics={activityMetrics} stats={stats} />
              <MetricGroup title="Operations" metrics={operationsMetrics} stats={stats} />
            </section>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
              <ModuleHealth modules={moduleHealth} />
              <ClientsNeedingAttention clients={clientsNeedingAttention} />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>Normalized client and module events across the selected filters.</CardDescription>
              </CardHeader>
              <CardContent>
                {(data?.recent_activity ?? []).length ? (
                  <AdminActivityTimeline rows={data?.recent_activity ?? []} />
                ) : (
                  <EmptyState inline title="No recent activity events" description="Client activity events will appear here once modules record work." />
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AdminShell>
  );
}

function buildOverviewSummary(stats: Record<string, number | string | null>, attention: Array<Record<string, unknown>>, clients: ClientRow[]) {
  const critical = Number(stats.active_critical_incidents ?? 0) + Number(stats.failed_jobs ?? 0);
  const warnings =
    Number(stats.active_warning_incidents ?? 0) +
    Number(stats.failing_integrations ?? 0) +
    Number(stats.degraded_integrations ?? 0) +
    Number(stats.clients_needing_reconnect ?? 0) +
    Number(stats.incomplete_setup_clients ?? 0);
  const totalActivity =
    Number(stats.recent_posts ?? 0) +
    Number(stats.recent_review_requests ?? 0) +
    Number(stats.recent_reviews ?? 0) +
    Number(stats.recent_leads ?? 0) +
    Number(stats.recent_owner_notifications ?? 0);
  const health = critical > 0 ? "critical" : warnings > 0 || attention.length > 0 ? "warning" : clients.length > 0 || totalActivity > 0 ? "healthy" : "no_data";
  return {
    health,
    healthLabel: health === "no_data" ? "No data yet" : labelize(health),
    description:
      health === "critical"
        ? `${critical} critical operational issue${critical === 1 ? "" : "s"}`
        : health === "warning"
          ? `${warnings + attention.length} item${warnings + attention.length === 1 ? "" : "s"} need review`
          : health === "healthy"
            ? "No critical platform issues"
            : "No platform activity yet",
    integrationIssueCount:
      Number(stats.active_critical_incidents ?? 0) +
      Number(stats.active_warning_incidents ?? 0) +
      Number(stats.failing_integrations ?? 0) +
      Number(stats.degraded_integrations ?? 0),
    activityCount: totalActivity,
  };
}

function PlatformHealthCallout({ stats }: { stats: Record<string, number | string | null> }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2 text-primary">
            <Siren className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Integration Health & Recovery</p>
            <h2 className="text-lg font-semibold">Platform health is {labelize(String(stats.platform_health_status ?? "healthy"))}</h2>
            <p className="text-sm text-muted-foreground">
              {String(stats.active_critical_incidents ?? 0)} critical, {String(stats.active_warning_incidents ?? 0)} warnings, {String(stats.clients_needing_reconnect ?? 0)} client reconnects needed.
            </p>
          </div>
        </div>
        <Link className="inline-flex items-center justify-center rounded-lg border border-border bg-white px-3 py-2 text-sm font-semibold hover:bg-accent" href="/admin/integration-health">
          Open Health Center
        </Link>
      </CardContent>
    </Card>
  );
}

function AttentionPanel({ issues }: { issues: Array<Record<string, unknown>> }) {
  const visibleIssues = issues.slice(0, 8);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Attention Needed</CardTitle>
        <CardDescription>Highest priority client, billing, setup, job, and integration issues.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {visibleIssues.length === 0 ? (
          <EmptyState inline title="Nothing needs attention right now" description="No critical or warning signals are active for the selected filters." />
        ) : (
          visibleIssues.map((issue, index) => (
            <div key={`${issue.title}-${index}`} className="flex flex-col gap-3 rounded-lg border border-border p-4 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={severityVariant(String(issue.severity ?? "warning"))}>{labelize(String(issue.severity ?? "warning"))}</Badge>
                  <p className="font-semibold">{String(issue.title ?? "Issue")}</p>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{String(issue.client ?? "Platform-wide")} · {labelize(String(issue.module ?? "general"))}</p>
              </div>
              <IssueAction issue={issue} />
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function NextActions({ stats, attentionCount }: { stats: Record<string, number | string | null>; attentionCount: number }) {
  const actions = [
    { label: "Review integration incidents", href: "/admin/integration-health", count: Number(stats.active_critical_incidents ?? 0) + Number(stats.active_warning_incidents ?? 0), icon: PlugZap },
    { label: "Check module health", href: "/admin/module-health", count: Number(stats.incomplete_setup_clients ?? 0), icon: Wrench },
    { label: "Open client monitor", href: "/admin/clients", count: attentionCount, icon: Users },
    { label: "Inspect Lead Recovery", href: "/admin/lead-recovery", count: Number(stats.recent_leads ?? 0), icon: Activity },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>What To Click Next</CardTitle>
        <CardDescription>Fast paths based on current operational signals.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {actions.map((action) => (
          <Link key={action.href} href={action.href} className="flex items-center justify-between rounded-lg border border-border p-3 text-sm hover:bg-accent">
            <span className="flex items-center gap-2 font-semibold">
              <action.icon className="h-4 w-4 text-muted-foreground" />
              {action.label}
            </span>
            <Badge variant={action.count > 0 ? "warning" : "muted"}>{action.count}</Badge>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

function ModuleHealth({ modules }: { modules: Array<Record<string, unknown>> }) {
  return (
    <Card>
      <CardHeader className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <CardTitle>Module Health</CardTitle>
          <CardDescription>Which services are active, inactive, or carrying issues.</CardDescription>
        </div>
        <Link className="rounded-lg border border-border bg-white px-3 py-2 text-xs font-semibold hover:bg-accent" href="/admin/module-health">
          Open module health
        </Link>
      </CardHeader>
      <CardContent>
        <Table>
          <THead>
            <TR>
              <TH>Module</TH>
              <TH>Status</TH>
              <TH>Active</TH>
              <TH>Activity</TH>
              <TH>Issues</TH>
              <TH>Action</TH>
            </TR>
          </THead>
          <TBody>
            {modules.map((row) => (
              <TR key={String(row.id)}>
                <TD className="font-semibold">{String(row.label ?? "Module")}</TD>
                <TD>{statusBadge(row.status)}</TD>
                <TD>{String(row.active_clients ?? 0)}</TD>
                <TD>{String(row.activity_count ?? 0)}</TD>
                <TD>{String(row.issue_count ?? 0)}</TD>
                <TD><Link className="text-sm font-medium text-primary" href={`/admin/modules/${String(row.id).replaceAll("_", "-")}`}>Inspect</Link></TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function ClientsNeedingAttention({ clients }: { clients: ClientRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Clients Needing Attention</CardTitle>
        <CardDescription>Clients with billing, setup, or notification issues.</CardDescription>
      </CardHeader>
      <CardContent>
        {clients.length === 0 ? (
          <EmptyState inline title="No client issues" description="No clients have open setup or billing issues for these filters." />
        ) : (
          <div className="space-y-2">
            {clients.map((client) => (
              <div key={String(client.tenant_id)} className="rounded-lg border border-border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{client.business_name ?? "Client"}</p>
                    <p className="text-xs text-muted-foreground">{client.last_activity ? `Last activity ${formatDate(client.last_activity)}` : "No activity recorded"}</p>
                  </div>
                  {statusBadge(client.subscription_status ?? client.client_stage ?? "unknown")}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{(client.open_issues ?? []).join(", ")}</p>
                <Link className="mt-3 inline-flex rounded-lg border border-border px-3 py-1.5 text-xs font-semibold" href={`/admin/clients/${String(client.tenant_id)}`}>
                  View client
                </Link>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MetricGroup({ title, metrics, stats }: { title: string; metrics: readonly (readonly [string, string, string])[]; stats: Record<string, number | string | null> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {metrics.map(([label, key, description]) => {
          const value = Number(stats[key] ?? 0);
          return (
            <div key={key} className="rounded-lg border border-border p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
              <p className="mt-2 text-2xl font-semibold">{value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{description}</p>
            </div>
          );
        })}
      </CardContent>
    </Card>
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

function HealthBadge({ health, label }: { health?: string; label?: string }) {
  const normalized = String(health ?? "no_data");
  const Icon = normalized === "healthy" ? CheckCircle2 : normalized === "critical" ? AlertTriangle : normalized === "warning" ? Wrench : Gauge;
  return (
    <Badge variant={healthVariant(normalized)} className="w-fit capitalize">
      <Icon className="h-3.5 w-3.5" />
      {label ?? labelize(normalized)}
    </Badge>
  );
}

function IssueAction({ issue }: { issue: Record<string, unknown> }) {
  const moduleName = String(issue.module ?? "");
  const tenantId = String(issue.tenant_id ?? "");
  if (tenantId) {
    return <Link className="rounded-lg border border-border px-3 py-2 text-sm font-semibold" href={`/admin/clients/${tenantId}`}>View client</Link>;
  }
  if (moduleName.includes("integration") || moduleName.includes("google") || moduleName.includes("twilio")) {
    return <Link className="rounded-lg border border-border px-3 py-2 text-sm font-semibold" href="/admin/integration-health">View health</Link>;
  }
  if (moduleName.includes("lead")) {
    return <Link className="rounded-lg border border-border px-3 py-2 text-sm font-semibold" href="/admin/lead-recovery">View leads</Link>;
  }
  return <Link className="rounded-lg border border-border px-3 py-2 text-sm font-semibold" href="/admin/clients">View clients</Link>;
}

function healthVariant(health: string) {
  if (health === "healthy") return "success";
  if (health === "critical") return "danger";
  if (health === "warning") return "warning";
  return "muted";
}

function severityVariant(severity: string) {
  if (severity === "critical") return "danger";
  if (severity === "warning") return "warning";
  return "muted";
}

function labelize(value: string) {
  return value.replaceAll("_", " ");
}

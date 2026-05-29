"use client";

import { useMemo, useState } from "react";
import type React from "react";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDate } from "@/lib/date-utils";

export type AdminFilters = {
  tenant_ids?: string;
  range?: string;
  module?: string;
  status?: string;
  q?: string;
};

type FilterBarProps = {
  filters: AdminFilters;
  onChange: (filters: AdminFilters) => void;
  clients?: Array<{ tenant_id?: string; business_name?: string }>;
  modules?: Array<{ id: string; label: string }>;
  showModule?: boolean;
  showStatus?: boolean;
  searchPlaceholder?: string;
  showReset?: boolean;
};

export function AdminFilterBar({ filters, onChange, clients = [], modules = [], showModule, showStatus, searchPlaceholder = "Business, email, tenant id, location", showReset }: FilterBarProps) {
  const [query, setQuery] = useState(filters.q ?? "");
  const resetFilters = () => {
    setQuery("");
    onChange({ range: filters.range ?? "30d" });
  };

  return (
    <Card>
      <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end">
        <label className="min-w-0 text-sm">
          Client
          <Select
            className="mt-1 w-full lg:w-56"
            value={filters.tenant_ids ?? ""}
            onChange={(event) => onChange({ ...filters, tenant_ids: event.target.value || undefined })}
            options={[
              { label: "All clients", value: "" },
              ...clients.map((client) => ({ label: client.business_name ?? client.tenant_id ?? "Client", value: client.tenant_id ?? "" })),
            ]}
          />
        </label>
        <label className="min-w-0 text-sm">
          Date range
          <Select
            className="mt-1 w-full lg:w-36"
            value={filters.range ?? "30d"}
            onChange={(event) => onChange({ ...filters, range: event.target.value })}
            options={[
              { label: "Today", value: "today" },
              { label: "7 days", value: "7d" },
              { label: "30 days", value: "30d" },
              { label: "90 days", value: "90d" },
            ]}
          />
        </label>
        {showModule && (
          <label className="min-w-0 text-sm">
            Module
            <Select
              className="mt-1 w-full lg:w-44"
              value={filters.module ?? ""}
              onChange={(event) => onChange({ ...filters, module: event.target.value || undefined })}
              options={[{ label: "All modules", value: "" }, ...modules.map((module) => ({ label: module.label, value: module.id }))]}
            />
          </label>
        )}
        {showStatus && (
          <label className="min-w-0 text-sm">
            Status
            <Select
              className="mt-1 w-full lg:w-40"
              value={filters.status ?? ""}
              onChange={(event) => onChange({ ...filters, status: event.target.value || undefined })}
              options={[
                { label: "Any status", value: "" },
                { label: "Healthy", value: "healthy" },
                { label: "Warning", value: "warning" },
                { label: "Critical", value: "critical" },
                { label: "Inactive", value: "inactive" },
              ]}
            />
          </label>
        )}
        <label className="min-w-0 text-sm lg:flex-1">
          Search
          <div className="relative mt-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder={searchPlaceholder}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") onChange({ ...filters, q: query || undefined });
              }}
            />
          </div>
        </label>
        <Button variant="outline" className="w-full lg:w-auto" onClick={() => onChange({ ...filters, q: query || undefined })}>Apply</Button>
        {showReset && <Button variant="ghost" className="w-full lg:w-auto" onClick={resetFilters}>Clear</Button>}
      </CardContent>
    </Card>
  );
}

export function AdminStatCard({
  label,
  value,
  description,
  tone = "default",
  density = "default",
}: {
  label: string;
  value: unknown;
  description?: string;
  tone?: "default" | "success" | "warning" | "danger";
  density?: "default" | "compact";
}) {
  const toneClass = tone === "success" ? "border-emerald-200" : tone === "warning" ? "border-amber-200" : tone === "danger" ? "border-red-200" : "";
  const compact = density === "compact";

  return (
    <Card className={`h-full ${toneClass}`}>
      <CardContent className={`flex items-center px-5 ${compact ? "min-h-16 py-3 sm:py-3" : "min-h-24 py-4 sm:py-4"}`}>
        <div className="flex w-full items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className={`${compact ? "mt-1 text-xl" : "mt-2 text-2xl"} font-semibold`}>{String(value ?? "0")}</p>
            {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function AdminIssueList({ issues }: { issues: Array<Record<string, unknown>> }) {
  return (
    <div className="space-y-2">
      {issues.length === 0 ? (
        <p className="text-sm text-muted-foreground">No priority issues found for the selected filters.</p>
      ) : (
        issues.map((issue, index) => (
          <div key={`${issue.title}-${index}`} className="rounded-lg border border-border bg-white/70 p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-semibold">{String(issue.title ?? "Issue")}</p>
              <Badge variant={issue.severity === "critical" ? "danger" : issue.severity === "warning" ? "warning" : "muted"}>
                {String(issue.severity ?? "info")}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{String(issue.client ?? issue.tenant_id ?? "Platform-wide")} · {String(issue.module ?? "general")}</p>
          </div>
        ))
      )}
    </div>
  );
}

export function AdminActivityTimeline({ rows }: { rows: Array<Record<string, unknown>> }) {
  return (
    <div className="space-y-2">
      {rows.map((row, index) => (
        <div key={String(row.id ?? index)} className="rounded-lg border border-border bg-white/70 p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-semibold">{String(row.title ?? row.event_type ?? "Activity")}</p>
            <Badge variant={row.status === "failed" ? "danger" : row.status === "warning" ? "warning" : "muted"}>{String(row.module ?? "module")}</Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{String(row.client ?? row.tenant_id ?? "Client")} · {formatDate(String(row.created_at ?? ""))}</p>
          {Boolean(row.description) && <p className="mt-2 text-muted-foreground">{String(row.description)}</p>}
        </div>
      ))}
    </div>
  );
}

export function AdminModuleTable({
  rows,
  columns,
  actions,
}: {
  rows: Array<Record<string, unknown>>;
  columns: Array<{ key: string; label: string; render?: (row: Record<string, unknown>) => React.ReactNode }>;
  actions?: (row: Record<string, unknown>) => React.ReactNode;
}) {
  const visibleRows = useMemo(() => rows.slice(0, 100), [rows]);
  return (
    <Table>
      <THead>
        <TR>
          {columns.map((column) => <TH key={column.key}>{column.label}</TH>)}
          {actions && <TH>Actions</TH>}
        </TR>
      </THead>
      <TBody>
        {visibleRows.map((row, index) => (
          <TR key={String(row.id ?? row.tenant_id ?? index)}>
            {columns.map((column) => (
              <TD key={column.key}>{column.render ? column.render(row) : String(row[column.key] ?? "-")}</TD>
            ))}
            {actions && <TD>{actions(row)}</TD>}
          </TR>
        ))}
      </TBody>
    </Table>
  );
}

export function statusBadge(status: unknown) {
  const value = String(status ?? "unknown");
  const variant = ["active", "healthy", "qualified", "booked", "completed", "connected"].includes(value)
    ? "success"
    : ["critical", "failed", "lost", "error"].includes(value)
      ? "danger"
      : ["warning", "new", "responded", "auto_contacted", "inactive"].includes(value)
        ? "warning"
        : "muted";
  return <Badge variant={variant}>{value.replaceAll("_", " ")}</Badge>;
}

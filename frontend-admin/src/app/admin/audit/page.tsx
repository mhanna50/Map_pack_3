"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { adminApi } from "@/lib/adminApiClient";
import { formatDate } from "@/lib/date-utils";

type AuditRow = { id?: string; tenant_id?: string; event_type?: string; actor_user_id?: string; old_value?: string; new_value?: string; created_at?: string };

export default function AuditPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await adminApi.audit({ page: 1, pageSize: 50 });
        if (!active) return;
        setRows(data.rows ?? []);
      } catch (err: unknown) {
        if (!active) return;
        const message = err instanceof Error ? err.message : "Failed to load audit log";
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
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Audit</p>
            <h1 className="text-2xl font-semibold">Audit logs</h1>
          </div>
          <Button variant="outline" size="sm">
            Export CSV (placeholder)
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Recent events</CardTitle>
            <CardDescription>Onboarding, billing changes, impersonations, actions</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-48 w-full" />
            ) : error ? (
              <EmptyState inline title="Could not load audit log" description={error} />
            ) : rows.length === 0 ? (
              <EmptyState inline title="No audit entries" />
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Event</TH>
                    <TH>Tenant</TH>
                    <TH>Actor</TH>
                    <TH>Diff</TH>
                    <TH>When</TH>
                  </TR>
                </THead>
                <TBody>
                  {rows.map((row) => (
                    <TR key={row.id ?? row.created_at}>
                      <TD>{row.event_type ?? "event"}</TD>
                      <TD>{row.tenant_id ?? "—"}</TD>
                      <TD>{row.actor_user_id ?? "—"}</TD>
                      <TD className="text-xs text-muted-foreground">
                        {row.old_value ?? ""} → {row.new_value ?? ""}
                      </TD>
                      <TD>{formatDate(row.created_at)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  );
}

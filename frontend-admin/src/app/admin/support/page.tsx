"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { adminApi } from "@/lib/adminApiClient";
import { formatDate } from "@/lib/date-utils";

type SupportTicket = { id?: string; tenant_id?: string; subject?: string; status?: string; created_at?: string };

export default function SupportPage() {
  const [rows, setRows] = useState<SupportTicket[]>([]);
  const [status, setStatus] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await adminApi.support({ status });
        if (!active) return;
        setRows(data.rows ?? []);
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
  }, [status]);

  return (
    <AdminShell>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Support</p>
            <h1 className="text-2xl font-semibold">Support tickets overview</h1>
          </div>
          <Select
            className="w-40"
            value={status ?? ""}
            onChange={(e) => setStatus(e.target.value || undefined)}
            options={[
              { label: "All status", value: "" },
              { label: "Open", value: "open" },
              { label: "Pending", value: "pending" },
              { label: "Closed", value: "closed" },
            ]}
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Tickets</CardTitle>
            <CardDescription>Cross-tenant view; filter by status</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-48 w-full" />
            ) : error ? (
              <EmptyState inline title="Could not load tickets" description={error} />
            ) : rows.length === 0 ? (
              <EmptyState inline title="No tickets" />
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Tenant</TH>
                    <TH>Subject</TH>
                    <TH>Status</TH>
                    <TH>Created</TH>
                  </TR>
                </THead>
                <TBody>
                  {rows.map((row) => (
                    <TR key={row.id ?? row.created_at}>
                      <TD>{row.tenant_id}</TD>
                      <TD>{row.subject}</TD>
                      <TD>
                        <Badge variant={row.status === "closed" ? "muted" : row.status === "pending" ? "warning" : "success"} className="capitalize">
                          {row.status ?? "open"}
                        </Badge>
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

"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { adminApi } from "@/lib/adminApiClient";
import { formatDate } from "@/lib/date-utils";

type GbpRow = {
  id?: string;
  tenant_id?: string;
  tenants?: { business_name?: string };
  status?: string;
  google_account_email?: string | null;
  connected_at?: string;
  locations_connected?: number;
  locations?: unknown[];
};

export default function GbpAdminPage() {
  const [rows, setRows] = useState<GbpRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await adminApi.gbp();
        if (!active) return;
        setRows(data.rows ?? []);
      } catch (err: unknown) {
        if (!active) return;
        const message = err instanceof Error ? err.message : "Failed to load GBP connections";
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
            <p className="text-xs uppercase tracking-wide text-muted-foreground">GBP</p>
            <h1 className="text-2xl font-semibold">Connection health</h1>
          </div>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Connections</CardTitle>
              <CardDescription>Test connection, multi-location support, enable automations</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-48 w-full" />
            ) : error ? (
              <EmptyState inline title="Could not load GBP connections" description={error} />
            ) : rows.length === 0 ? (
              <EmptyState inline title="No connections" />
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Tenant</TH>
                    <TH>Status</TH>
                    <TH>Google account</TH>
                    <TH>Connected</TH>
                    <TH>Locations</TH>
                    <TH>Actions</TH>
                  </TR>
                </THead>
                <TBody>
                  {rows.map((row) => (
                    <TR key={row.id ?? row.tenant_id}>
                      <TD>
                        <div className="font-semibold">{row.tenants?.business_name ?? row.tenant_id}</div>
                        <p className="text-xs text-muted-foreground">{row.tenant_id}</p>
                      </TD>
                      <TD>
                        <Badge variant={row.status === "connected" ? "success" : "warning"} className="capitalize">
                          {row.status ?? "unknown"}
                        </Badge>
                      </TD>
                      <TD>{row.google_account_email ?? "—"}</TD>
                      <TD>{formatDate(row.connected_at)}</TD>
                      <TD>{row.locations_connected ?? row.locations?.length ?? "—"}</TD>
                      <TD>
                        <div className="flex flex-wrap gap-2 text-xs">
                          <Button variant="outline" size="sm">
                            Test connection
                          </Button>
                          <Button variant="ghost" size="sm">
                            Enable automations
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
      </div>
    </AdminShell>
  );
}

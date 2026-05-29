"use client";

import { useEffect, useMemo, useState } from "react";
import { Building2, RefreshCw, Shield, UserRound } from "lucide-react";
import { AdminShell } from "@/features/admin/components/shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { adminApi } from "@/features/admin/adminApiClient";
import { formatDate, timeAgo } from "@/lib/date-utils";
import { useToast } from "@/components/ui/toast";

type RoleTenant = {
  tenant_id: string;
  business_name: string;
  status?: string | null;
  role: string;
  is_primary?: boolean;
};

type RoleUser = {
  user_id: string;
  email?: string | null;
  full_name?: string | null;
  role: string;
  role_sources?: string[];
  tenants?: RoleTenant[];
  default_tenant_id?: string | null;
  created_at?: string | null;
  last_sign_in_at?: string | null;
  is_current_admin?: boolean;
};

type RolesResponse = {
  current_admin?: { id: string; email?: string | null; role?: string | null };
  stats?: Record<string, number>;
  rows?: RoleUser[];
};

export default function RolesPage() {
  const { pushToast } = useToast();
  const [data, setData] = useState<RolesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyTenant, setBusyTenant] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setData((await adminApi.roles()) as RolesResponse);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to load roles");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const rows = useMemo(() => data?.rows ?? [], [data?.rows]);
  const admins = useMemo(() => rows.filter((row) => isAdminRole(row.role)), [rows]);
  const clients = useMemo(() => rows.filter((row) => row.role === "client"), [rows]);
  const orphanedAppRows = data?.stats?.orphaned_app_rows ?? 0;

  const openAsClient = async (tenantId: string) => {
    setBusyTenant(tenantId);
    try {
      const result = await adminApi.impersonateDeepLink(tenantId, "/dashboard", "roles");
      const clientBase = (process.env.NEXT_PUBLIC_CLIENT_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
      window.open(`${clientBase}${result.targetPath}`, "_blank", "noopener,noreferrer");
      pushToast({ title: "Client tab opened", description: "Impersonation was audited.", tone: "success" });
    } catch (err: unknown) {
      pushToast({
        title: "Impersonation failed",
        description: err instanceof Error ? err.message : "Unable to open as client",
        tone: "error",
      });
    } finally {
      setBusyTenant(null);
    }
  };

  return (
    <AdminShell>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Access Control</p>
            <h1 className="text-2xl font-semibold">Roles & permissions</h1>
            <p className="text-sm text-muted-foreground">
              Real admin accounts, client memberships, tenant access, and sign-in activity.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>

        {loading ? (
          <Skeleton className="h-96 w-full" />
        ) : error ? (
          <EmptyState inline title="Could not load roles" description={error} />
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-4">
              <StatCard icon={UserRound} label="Total users" value={data?.stats?.total_users ?? rows.length} />
              <StatCard icon={Shield} label="Admins" value={data?.stats?.admins ?? admins.length} tone="success" />
              <StatCard icon={Building2} label="Client users" value={data?.stats?.clients ?? clients.length} />
              <StatCard label="Tenant memberships" value={data?.stats?.tenant_memberships ?? 0} />
            </div>

            {orphanedAppRows > 0 && (
              <Card>
                <CardContent className="p-4 text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">{orphanedAppRows} orphaned app role row{orphanedAppRows === 1 ? "" : "s"} excluded.</span>{" "}
                  Accounts are now shown only when a matching Supabase Auth user exists.
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>What this tab is for</CardTitle>
                <CardDescription>Admin accounts are platform-wide. Client invites are tenant-scoped onboarding links.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm text-muted-foreground md:grid-cols-3">
                <InfoBlock title="Confirm owner access" text="Your current admin account should appear first and be marked You." />
                <InfoBlock title="Audit tenant access" text="Each client user shows the tenants they can access and whether they are primary." />
                <InfoBlock title="Support safely" text="Use Open as client to start an audited impersonation session for a tenant." />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
                <div>
                  <CardTitle>Accounts</CardTitle>
                  <CardDescription>Resolved from Supabase Auth, profiles, memberships, and staff records.</CardDescription>
                </div>
                <Badge variant="muted">{rows.length} users</Badge>
              </CardHeader>
              <CardContent>
                {rows.length === 0 ? (
                  <EmptyState inline title="No users found" />
                ) : (
                  <Table>
                    <THead>
                      <TR>
                        <TH>User</TH>
                        <TH>Role</TH>
                        <TH>Tenant access</TH>
                        <TH>Role source</TH>
                        <TH>Last sign-in</TH>
                        <TH>Created</TH>
                        <TH>Actions</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {rows.map((row) => {
                        const firstTenant = row.tenants?.[0];
                        return (
                          <TR key={row.user_id}>
                            <TD>
                              <div className="font-semibold">{row.email ?? row.user_id}</div>
                              <div className="text-xs text-muted-foreground">
                                {row.full_name ? `${row.full_name} · ` : ""}
                                {row.is_current_admin ? "You" : row.user_id}
                              </div>
                            </TD>
                            <TD>
                              <Badge variant={isAdminRole(row.role) ? "success" : row.role === "client" ? "outline" : "muted"}>
                                {row.role}
                              </Badge>
                            </TD>
                            <TD className="max-w-[300px]">
                              {row.tenants?.length ? (
                                <div className="space-y-1 text-xs">
                                  {row.tenants.slice(0, 3).map((tenant) => (
                                    <div key={tenant.tenant_id} className="rounded-md bg-muted/60 px-2 py-1">
                                      <span className="font-medium">{tenant.business_name}</span>
                                      <span className="text-muted-foreground">
                                        {" "}
                                        · {tenant.role}
                                        {tenant.is_primary ? " · primary" : ""}
                                      </span>
                                    </div>
                                  ))}
                                  {row.tenants.length > 3 && <span className="text-muted-foreground">+{row.tenants.length - 3} more</span>}
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">Platform-wide or unassigned</span>
                              )}
                            </TD>
                            <TD className="text-xs text-muted-foreground">{row.role_sources?.join(", ") ?? "-"}</TD>
                            <TD>{row.last_sign_in_at ? timeAgo(row.last_sign_in_at) : "-"}</TD>
                            <TD>{formatDate(row.created_at)}</TD>
                            <TD>
                              {firstTenant && !isAdminRole(row.role) ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openAsClient(firstTenant.tenant_id)}
                                  disabled={busyTenant === firstTenant.tenant_id}
                                >
                                  <Shield className="h-4 w-4" />
                                  Open as client
                                </Button>
                              ) : (
                                <span className="text-xs text-muted-foreground">No client action</span>
                              )}
                            </TD>
                          </TR>
                        );
                      })}
                    </TBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AdminShell>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  value: unknown;
  tone?: "success";
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3 p-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold">{String(value ?? 0)}</p>
        </div>
        {Icon && (
          <div className={tone === "success" ? "text-emerald-600" : "text-muted-foreground"}>
            <Icon className="h-5 w-5" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function InfoBlock({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <p className="font-semibold text-foreground">{title}</p>
      <p className="mt-1">{text}</p>
    </div>
  );
}

function isAdminRole(role?: string | null) {
  return Boolean(role && ["owner_admin", "owner", "admin", "super_admin", "superadmin", "staff"].includes(role));
}

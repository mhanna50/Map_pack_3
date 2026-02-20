"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/components/admin/shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { adminApi } from "@/lib/adminApiClient";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/date-utils";

type PendingInvite = {
  email: string;
  business_name: string;
  first_name?: string;
  last_name?: string;
  plan?: string;
  location_limit?: number;
  status?: string;
  invited_at?: string;
  profiles?: unknown;
  tenant_id?: string;
  agreement_signed_at?: string;
  payment_status?: string;
  gbp_connected?: boolean;
  automations_enabled?: boolean;
};

export default function OnboardingPage() {
  const { pushToast } = useToast();
  const [form, setForm] = useState({ email: "" });
  const [sending, setSending] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [rows, setRows] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await adminApi.onboardingList();
        if (!active) return;
        setRows(data.rows ?? []);
      } catch (err: unknown) {
        if (!active) return;
        const message = err instanceof Error ? err.message : "Failed to load onboarding list";
        setError(message);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [refreshKey]);

  const handleInvite = async () => {
    setSending(true);
    try {
      const res = await adminApi.invite(form);
      setLink(res.link);
      pushToast({ title: "Invite created", description: "Email delivery is placeholder today.", tone: "success" });
      setRefreshKey((k) => k + 1);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create invite";
      pushToast({ title: "Failed to create invite", description: message, tone: "error" });
    } finally {
      setSending(false);
    }
  };

  const handleResend = async (email: string) => {
    try {
      await adminApi.onboardingResend(email);
      pushToast({ title: "Invite resent", tone: "success" });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to resend";
      pushToast({ title: "Failed to resend", description: message, tone: "error" });
    }
  };

  const handleCancel = async (email: string) => {
    try {
      await adminApi.onboardingCancel(email);
      pushToast({ title: "Invite canceled", tone: "info" });
      setRefreshKey((k) => k + 1);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to cancel";
      pushToast({ title: "Failed to cancel", description: message, tone: "error" });
    }
  };

  const statusChips = (row: PendingInvite) => {
    const stages = [
      { key: "invited", label: "Invited", done: row.status === "invited" || row.status === "activated" || row.status === "completed" },
      { key: "account", label: "Account created", done: Boolean(row.profiles || row.tenant_id) || row.status === "activated" || row.status === "completed" },
      { key: "agreement", label: "Agreement", done: Boolean(row.agreement_signed_at) },
      { key: "payment", label: "Payment", done: row.payment_status === "active" || row.payment_status === "past_due" },
      { key: "gbp", label: "GBP connected", done: row.gbp_connected === true },
      { key: "automation", label: "Automations", done: row.automations_enabled === true },
    ];
    return (
      <div className="flex flex-wrap gap-2">
        {stages.map((stage) => (
          <Badge key={stage.key} variant={stage.done ? "success" : "muted"}>
            {stage.label}
          </Badge>
        ))}
      </div>
    );
  };

  const sortedRows = useMemo(() => rows.sort((a, b) => (b.invited_at ? new Date(b.invited_at).getTime() : 0) - (a.invited_at ? new Date(a.invited_at).getTime() : 0)), [rows]);

  return (
    <AdminShell>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Onboarding</p>
            <h1 className="text-2xl font-semibold">Invite new clients</h1>
            <p className="text-sm text-muted-foreground">Generate onboarding links and track pipeline steps.</p>
          </div>
          {link && (
            <Badge variant="outline" className="cursor-pointer" onClick={() => navigator.clipboard.writeText(link ?? "")}>
              Link copied?
            </Badge>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>New invite</CardTitle>
            <CardDescription>Send an onboarding link to the client’s email.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input placeholder="Client email" value={form.email} onChange={(e) => setForm({ email: e.target.value })} />
            <div className="flex gap-2">
              <Button onClick={handleInvite} disabled={sending}>
                {sending ? "Sending…" : "Create invite link"}
              </Button>
              {link && (
                <Button variant="outline" onClick={() => navigator.clipboard.writeText(link)}>
                  Copy link
                </Button>
              )}
            </div>
            {link && <p className="text-sm text-muted-foreground">Generated link: {link}</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Onboarding pipeline</CardTitle>
              <CardDescription>Placeholder states for agreement, payment, GBP connection, automation enablement</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-40 w-full" />
              ) : error ? (
                <EmptyState inline title="Could not load onboarding pipeline" description={error} />
              ) : sortedRows.length === 0 ? (
                <EmptyState inline title="No invites yet" />
              ) : (
                <div className="space-y-3 text-sm">
                  {sortedRows.map((row) => (
                    <div key={row.email} className="rounded-lg border border-border bg-white/60 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-semibold">{row.business_name || "Pending business name"}</p>
                          <p className="text-xs text-muted-foreground">{row.email}</p>
                          <p className="text-xs text-muted-foreground">Invited {formatDate(row.invited_at)}</p>
                        </div>
                        <Badge variant="muted" className="capitalize">
                          {row.plan} · {row.location_limit} locations
                        </Badge>
                      </div>
                      <div className="mt-3">{statusChips(row)}</div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" onClick={() => handleResend(row.email)}>
                          Resend invite
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleCancel(row.email)}>
                          Cancel invite
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setRefreshKey((k) => k + 1)}>
                          Refresh status
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </AdminShell>
    );
  }

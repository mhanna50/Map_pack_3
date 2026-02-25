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

const STATUS_RANK: Record<string, number> = {
  invited: 0,
  in_progress: 1,
  business_setup: 2,
  stripe_pending: 3,
  stripe_started: 4,
  google_pending: 5,
  google_connected: 6,
  activated: 7,
  completed: 7,
};

const STATUS_LABEL: Record<string, string> = {
  invited: "Invited",
  in_progress: "In progress",
  business_setup: "Business setup",
  stripe_pending: "Stripe pending",
  stripe_started: "Stripe started",
  google_pending: "Google pending",
  google_connected: "Google connected",
  activated: "Onboarding completed",
  completed: "Onboarding completed",
  canceled: "Invite canceled",
};

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

  useEffect(() => {
    const poller = setInterval(() => {
      setRefreshKey((k) => k + 1);
    }, 10000);
    return () => clearInterval(poller);
  }, []);

  const handleInvite = async () => {
    setSending(true);
    try {
      const res = await adminApi.invite(form);
      setLink(res.link);
      pushToast({
        title: "Invite created",
        description: res.link ? "Sent via Supabase email (if SMTP is configured)." : "Invite created; copy link to send manually.",
        tone: "success",
      });
      setRefreshKey((k) => k + 1);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create invite";
      pushToast({ title: "Failed to create invite", description: message, tone: "error" });
    } finally {
      setSending(false);
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

  const handleDelete = async (email: string) => {
    try {
      await adminApi.onboardingDelete(email);
      pushToast({ title: "Invite deleted", tone: "info" });
      setRefreshKey((k) => k + 1);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to delete";
      pushToast({ title: "Failed to delete", description: message, tone: "error" });
    }
  };

  const statusChips = (row: PendingInvite) => {
    const normalizedStatus = (row.status ?? "").toLowerCase();
    const rank = STATUS_RANK[normalizedStatus] ?? 0;
    const completed = normalizedStatus === "completed" || normalizedStatus === "activated";
    const canceled = normalizedStatus === "canceled";
    const stages = [
      { key: "invited", label: "Invited", done: !canceled && rank >= STATUS_RANK.invited },
      {
        key: "business_setup",
        label: "Business setup",
        done: !canceled && (rank >= STATUS_RANK.business_setup || Boolean(row.tenant_id)),
      },
      {
        key: "stripe",
        label: "Stripe signup",
        done: !canceled && (rank >= STATUS_RANK.stripe_started || row.payment_status === "active" || row.payment_status === "past_due"),
      },
      {
        key: "google",
        label: "Google connected",
        done: !canceled && (rank >= STATUS_RANK.google_connected || row.gbp_connected === true || completed),
      },
      { key: "completed", label: "Onboarding completed", done: completed },
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

  const sortedRows = useMemo(
    () =>
      [...rows].sort(
        (a, b) => (b.invited_at ? new Date(b.invited_at).getTime() : 0) - (a.invited_at ? new Date(a.invited_at).getTime() : 0),
      ),
    [rows],
  );

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
                <div className="space-y-3">
                  <EmptyState inline title="Could not load onboarding pipeline" description={error} />
                  {error.toLowerCase().includes("admin role required") || error.toLowerCase().includes("not authenticated") ? (
                    <Card className="border-amber-200 bg-amber-50">
                      <CardContent className="space-y-3 pt-4">
                        <p className="text-sm text-slate-800">
                          Please sign in with an admin account to continue.
                        </p>
                        <div className="flex gap-2">
                          <Input
                            type="email"
                            placeholder="you@agency.com"
                            value={form.email}
                            onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                            className="max-w-xs"
                          />
                          <Button onClick={() => (window.location.href = `/sign-in?redirect=/admin/onboarding&prefill=${encodeURIComponent(form.email)}`)}>
                            Go to sign-in
                          </Button>
                        </div>
                        <p className="text-xs text-slate-600">After signing in, return here and refresh.</p>
                      </CardContent>
                    </Card>
                  ) : null}
                </div>
              ) : sortedRows.length === 0 ? (
                <EmptyState inline title="No invites yet" />
              ) : (
                <div className="space-y-3 text-sm">
                  {sortedRows.map((row) => {
                    const normalizedStatus = (row.status ?? "").toLowerCase();
                    const completed = normalizedStatus === "completed" || normalizedStatus === "activated";
                    const canceled = normalizedStatus === "canceled";
                    return (
                      <div key={row.email} className="rounded-lg border border-border bg-white/60 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="font-semibold">{row.business_name || "Pending business name"}</p>
                            <p className="text-xs text-muted-foreground">{row.email}</p>
                            <p className="text-xs text-muted-foreground">Invited {formatDate(row.invited_at)}</p>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <Badge variant={completed ? "success" : canceled ? "danger" : "muted"}>
                              {STATUS_LABEL[normalizedStatus] ?? "In progress"}
                            </Badge>
                            <Badge variant="muted" className="capitalize">
                              {row.plan} · {row.location_limit} locations
                            </Badge>
                          </div>
                        </div>
                        <div className="mt-3">{statusChips(row)}</div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button variant="ghost" size="sm" onClick={() => handleCancel(row.email)}>
                            Cancel invite
                          </Button>
                          <Button variant="destructive" size="sm" onClick={() => handleDelete(row.email)}>
                            Delete
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setRefreshKey((k) => k + 1)}>
                            Refresh status
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </AdminShell>
    );
  }

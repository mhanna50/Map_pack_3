"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdminShell } from "@/features/admin/components/shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { adminApi } from "@/features/admin/adminApiClient";
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
  status?: string;
  invited_at?: string;
  profiles?: unknown;
  tenant_id?: string;
  agreement_signed_at?: string;
  payment_status?: string;
  gbp_connected?: boolean;
  automations_enabled?: boolean;
  plan?: string;
  location_limit?: number;
};

const normalizeEmail = (value: string) => value.trim().toLowerCase();

function isCompletedStatus(status?: string) {
  const normalized = (status ?? "").toLowerCase();
  return normalized === "completed" || normalized === "activated";
}

export default function OnboardingPage() {
  const { pushToast } = useToast();
  const [form, setForm] = useState({ email: "" });
  const [sending, setSending] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [rows, setRows] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showIncompleteOnly, setShowIncompleteOnly] = useState(false);
  const [cancelingEmail, setCancelingEmail] = useState<string | null>(null);
  const [resendingEmail, setResendingEmail] = useState<string | null>(null);
  const [resendQueue, setResendQueue] = useState<Record<string, PendingInvite>>({});
  const [hiddenEmails, setHiddenEmails] = useState<Record<string, true>>({});
  const mountedRef = useRef(true);

  const loadRows = useCallback(async ({ background = false }: { background?: boolean } = {}) => {
    if (background) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const data = await adminApi.onboardingList();
      if (!mountedRef.current) return;
      const fetchedRows = (data.rows ?? []) as PendingInvite[];
      const fetchedEmails = new Set(fetchedRows.map((row) => normalizeEmail(row.email)));
      setRows(fetchedRows);
      setResendQueue((prev) => {
        const next: Record<string, PendingInvite> = {};
        Object.entries(prev).forEach(([email, row]) => {
          if (!fetchedEmails.has(email)) {
            next[email] = row;
          }
        });
        return next;
      });
    } catch (err: unknown) {
      if (!mountedRef.current) return;
      const message = err instanceof Error ? err.message : "Failed to load onboarding list";
      setError(message);
    } finally {
      if (!mountedRef.current) return;
      if (background) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void loadRows();
    return () => {
      mountedRef.current = false;
    };
  }, [loadRows]);

  useEffect(() => {
    const poller = setInterval(() => {
      void loadRows({ background: true });
    }, 10000);
    return () => clearInterval(poller);
  }, [loadRows]);

  const handleInvite = async () => {
    setSending(true);
    try {
      const res = await adminApi.invite(form);
      const invitedEmail = normalizeEmail(form.email);
      setHiddenEmails((prev) => {
        if (!prev[invitedEmail]) return prev;
        const next = { ...prev };
        delete next[invitedEmail];
        return next;
      });
      setLink(res.link);
      pushToast({
        title: "Invite created",
        description: res.link ? "Sent via Supabase email (if SMTP is configured)." : "Invite created; copy link to send manually.",
        tone: "success",
      });
      await loadRows({ background: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create invite";
      pushToast({ title: "Failed to create invite", description: message, tone: "error" });
    } finally {
      setSending(false);
    }
  };

  const handleCancel = async (email: string) => {
    const normalized = normalizeEmail(email);
    setCancelingEmail(normalized);
    try {
      const result = await adminApi.onboardingCancel(normalized);
      if (!result.canceled) {
        pushToast({
          title: "Cancel blocked",
          description: result.message ?? "Invite cannot be canceled after onboarding is completed.",
          tone: "error",
        });
        return;
      }

      const sourceRow =
        rows.find((row) => normalizeEmail(row.email) === normalized) ??
        resendQueue[normalized] ?? {
          email: normalized,
          business_name: "",
          status: "canceled",
        };

      setResendQueue((prev) => ({
        ...prev,
        [normalized]: {
          ...sourceRow,
          email: normalized,
          status: "canceled",
          invited_at: sourceRow.invited_at ?? new Date().toISOString(),
        },
      }));

      pushToast({
        title: "Invite canceled",
        description: "Auth user and onboarding rows were removed. Resend is now enabled.",
        tone: "info",
      });
      await loadRows({ background: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to cancel";
      pushToast({ title: "Failed to cancel", description: message, tone: "error" });
    } finally {
      setCancelingEmail(null);
    }
  };

  const handleDelete = (email: string) => {
    const normalized = normalizeEmail(email);
    setHiddenEmails((prev) => ({ ...prev, [normalized]: true }));
    setResendQueue((prev) => {
      if (!prev[normalized]) return prev;
      const next = { ...prev };
      delete next[normalized];
      return next;
    });
    pushToast({ title: "Card removed", description: "Removed from this page only.", tone: "info" });
  };

  const handleResend = async (email: string) => {
    const normalized = normalizeEmail(email);
    const row = resendQueue[normalized];
    if (!row) {
      pushToast({
        title: "Resend blocked",
        description: "Cancel and purge the invite first, then resend.",
        tone: "error",
      });
      return;
    }

    setResendingEmail(normalized);
    try {
      const result = await adminApi.onboardingResend({
        email: normalized,
        plan: row.plan,
        location_limit: row.location_limit,
        business_name: row.business_name,
        first_name: row.first_name,
        last_name: row.last_name,
      });

      setResendQueue((prev) => {
        const next = { ...prev };
        delete next[normalized];
        return next;
      });
      setHiddenEmails((prev) => {
        if (!prev[normalized]) return prev;
        const next = { ...prev };
        delete next[normalized];
        return next;
      });
      if (result.link) {
        setLink(result.link);
      }
      pushToast({
        title: "Invite resent",
        description: result.link ? "A fresh onboarding invite link was generated." : "Invite was resent.",
        tone: "success",
      });
      await loadRows({ background: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to resend invite";
      pushToast({ title: "Failed to resend", description: message, tone: "error" });
    } finally {
      setResendingEmail(null);
    }
  };

  const statusChips = (row: PendingInvite) => {
    const normalizedStatus = (row.status ?? "").toLowerCase();
    const rank = STATUS_RANK[normalizedStatus] ?? 0;
    const completed = isCompletedStatus(normalizedStatus);
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

  const mergedRows = useMemo(() => {
    const merged = new Map<string, PendingInvite>();
    rows.forEach((row) => {
      merged.set(normalizeEmail(row.email), row);
    });
    Object.entries(resendQueue).forEach(([email, row]) => {
      if (!merged.has(email)) {
        merged.set(email, row);
      }
    });
    return Array.from(merged.values());
  }, [rows, resendQueue]);

  const sortedRows = useMemo(
    () =>
      [...mergedRows].sort(
        (a, b) => (b.invited_at ? new Date(b.invited_at).getTime() : 0) - (a.invited_at ? new Date(a.invited_at).getTime() : 0),
      ),
    [mergedRows],
  );
  const visibleRows = useMemo(
    () =>
      (showIncompleteOnly ? sortedRows.filter((row) => !isCompletedStatus(row.status)) : sortedRows).filter(
        (row) => !hiddenEmails[normalizeEmail(row.email)],
      ),
    [hiddenEmails, showIncompleteOnly, sortedRows],
  );
  const showBlockingError = Boolean(error) && mergedRows.length === 0;

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
            <CardHeader className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>Onboarding pipeline</CardTitle>
                <CardDescription>Progress state is persisted and linked to each invited user.</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {refreshing ? <span className="text-xs text-muted-foreground">Refreshing…</span> : null}
                <Button variant={showIncompleteOnly ? "primary" : "outline"} size="sm" onClick={() => setShowIncompleteOnly((prev) => !prev)}>
                  {showIncompleteOnly ? "Showing incomplete only" : "Show incomplete only"}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {error && mergedRows.length > 0 ? <p className="mb-3 text-xs text-amber-700">Refresh failed: {error}</p> : null}
              {loading && mergedRows.length === 0 ? (
                <Skeleton className="h-40 w-full" />
              ) : showBlockingError ? (
                <div className="space-y-3">
                  <EmptyState inline title="Could not load onboarding pipeline" description={error ?? undefined} />
                  {(error ?? "").toLowerCase().includes("admin role required") || (error ?? "").toLowerCase().includes("not authenticated") ? (
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
              ) : visibleRows.length === 0 ? (
                <EmptyState inline title={showIncompleteOnly ? "Everyone here has completed onboarding" : "No invites yet"} />
              ) : (
                <div className="space-y-3 text-sm">
                  {visibleRows.map((row) => {
                    const emailKey = normalizeEmail(row.email);
                    const normalizedStatus = (row.status ?? "").toLowerCase();
                    const completed = isCompletedStatus(normalizedStatus);
                    const canceled = normalizedStatus === "canceled";
                    const resendReady = Boolean(resendQueue[emailKey]);
                    const canceling = cancelingEmail === emailKey;
                    const resending = resendingEmail === emailKey;
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
                          </div>
                        </div>
                        <div className="mt-3">{statusChips(row)}</div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCancel(row.email)}
                            disabled={completed || canceled || resendReady || canceling || resending}
                          >
                            {canceling ? "Canceling…" : "Cancel invite"}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleResend(row.email)}
                            disabled={!resendReady || resending || canceling}
                          >
                            {resending ? "Resending…" : "Resend invite"}
                          </Button>
                          <Button variant="destructive" size="sm" onClick={() => handleDelete(row.email)} disabled={canceling || resending}>
                            Delete
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => void loadRows({ background: true })}>
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

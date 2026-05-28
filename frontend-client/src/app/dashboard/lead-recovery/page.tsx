"use client";

import { useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Bell, CheckCircle2, RefreshCw, Save, Send, Settings2 } from "lucide-react";
import { DashboardShell } from "@/features/dashboard/components/shell";
import { useTenant } from "@/features/tenants/tenant-context";
import { fetchBackendJson } from "@/lib/backend-api";
import { format } from "@/lib/date-utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

type LeadRecoverySettings = {
  id: string;
  tenant_id: string;
  enabled: boolean;
  business_phone?: string | null;
  owner_notification_phone?: string | null;
  owner_notification_email?: string | null;
  business_name?: string | null;
  twilio_phone_number?: string | null;
  twilio_phone_sid?: string | null;
  forwarding_status: string;
  verification_status?: string | null;
  last_verification_attempt_at?: string | null;
  verified_at?: string | null;
  test_call_from_phone?: string | null;
  last_test_call_sid?: string | null;
  consent_confirmed?: boolean | null;
  missed_call_textback_enabled: boolean;
  intake_questions_enabled: boolean;
  owner_notifications_enabled: boolean;
  no_response_followup_enabled: boolean;
  completed_job_review_request_enabled: boolean;
};

type Lead = {
  id: string;
  tenant_id: string;
  source: string;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_email?: string | null;
  service_requested?: string | null;
  location?: string | null;
  urgency?: string | null;
  preferred_time?: string | null;
  details?: string | null;
  status: string;
  owner_summary?: string | null;
  last_message_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  last_message?: string | null;
};

type LeadMessage = {
  id: string;
  direction: string;
  channel: string;
  body?: string | null;
  created_at: string;
};

type LeadNote = {
  id: string;
  note: string;
  created_at: string;
};

type LeadDetail = Lead & {
  messages: LeadMessage[];
  notes: LeadNote[];
  suggested_next_action: string;
};

const statusLabels: Record<string, string> = {
  not_configured: "Not configured",
  waiting_for_forwarding: "Waiting for call forwarding setup",
  waiting_for_verification: "Waiting for verification",
  verified: "Active",
  active: "Active",
  error: "Error",
  failed: "Error",
  skipped: "Skipped",
};

const leadStatuses = ["new", "auto_contacted", "responded", "qualified", "contacted", "booked", "lost", "completed"];

export default function LeadRecoveryPage() {
  const { tenantId, supabase, refresh: refreshTenant } = useTenant();
  const [settings, setSettings] = useState<LeadRecoverySettings | null>(null);
  const [draft, setDraft] = useState<Partial<LeadRecoverySettings>>({});
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedLead, setSelectedLead] = useState<LeadDetail | null>(null);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const organizationQuery = useMemo(() => ({ organization_id: tenantId ?? undefined }), [tenantId]);
  const selectedLeadId = selectedLead?.id;

  useEffect(() => {
    if (!tenantId) {
      setLoading(false);
      return;
    }
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [settingsRow, leadRows] = await Promise.all([
          fetchBackendJson<LeadRecoverySettings>("/lead-recovery/settings", { query: organizationQuery }, supabase),
          fetchBackendJson<Lead[]>("/lead-recovery/leads", { query: organizationQuery }, supabase),
        ]);
        if (!active) return;
        setSettings(settingsRow);
        setDraft(settingsRow);
        setLeads(leadRows ?? []);
        if (selectedLeadId) {
          const refreshed = await fetchBackendJson<LeadDetail>(
            `/lead-recovery/leads/${selectedLeadId}`,
            { query: organizationQuery },
            supabase,
          );
          if (active) setSelectedLead(refreshed);
        }
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Unable to load Lead Recovery");
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [tenantId, organizationQuery, supabase, refreshKey, selectedLeadId]);

  const connected = Boolean(
    settings?.enabled && settings?.twilio_phone_number && ["active", "verified"].includes(settings.forwarding_status),
  );

  const saveSettings = async (updates?: Partial<LeadRecoverySettings>) => {
    if (!tenantId) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const payload = updates ?? draft;
      const updated = await fetchBackendJson<LeadRecoverySettings>(
        "/lead-recovery/settings",
        {
          method: "PATCH",
          query: organizationQuery,
          body: JSON.stringify(cleanPayload(payload)),
        },
        supabase,
      );
      setSettings(updated);
      setDraft(updated);
      setMessage("Lead Recovery settings saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save settings");
    } finally {
      setSaving(false);
    }
  };

  const markForwardingSetup = async () => {
    await saveSettings({ ...draft, enabled: true, forwarding_status: "waiting_for_verification" });
  };

  const testSetup = () => {
    setMessage(
      `Call your business phone and let it ring unanswered. It should forward to ${draft.twilio_phone_number || "your recovery number"}.`,
    );
  };

  const openLead = async (leadId: string) => {
    const detail = await fetchBackendJson<LeadDetail>(`/lead-recovery/leads/${leadId}`, { query: organizationQuery }, supabase);
    setSelectedLead(detail);
  };

  const markLead = async (leadId: string, action: "contacted" | "booked" | "lost" | "completed") => {
    const updated = await fetchBackendJson<Lead>(
      `/lead-recovery/leads/${leadId}/mark-${action}`,
      { method: "POST", query: organizationQuery },
      supabase,
    );
    setLeads((rows) => rows.map((row) => (row.id === leadId ? updated : row)));
    if (selectedLead?.id === leadId) {
      await openLead(leadId);
    }
  };

  const saveLeadStatus = async (status: string) => {
    if (!selectedLead) return;
    const updated = await fetchBackendJson<Lead>(
      `/lead-recovery/leads/${selectedLead.id}`,
      {
        method: "PATCH",
        query: organizationQuery,
        body: JSON.stringify({ status }),
      },
      supabase,
    );
    setLeads((rows) => rows.map((row) => (row.id === updated.id ? updated : row)));
    await openLead(updated.id);
  };

  const addNote = async () => {
    if (!selectedLead || !note.trim()) return;
    await fetchBackendJson<LeadNote>(
      `/lead-recovery/leads/${selectedLead.id}/notes`,
      {
        method: "POST",
        query: organizationQuery,
        body: JSON.stringify({ note: note.trim() }),
      },
      supabase,
    );
    setNote("");
    await openLead(selectedLead.id);
  };

  const handleRefresh = async () => {
    await refreshTenant();
    setRefreshKey((key) => key + 1);
  };

  return (
    <DashboardShell onRefresh={handleRefresh}>
      <div className="space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Missed-call recovery</p>
            <h1 className="text-2xl font-semibold">Lead Recovery</h1>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={connected ? "success" : "warning"}>{connected ? "Active" : "Setup needed"}</Badge>
            <Button variant="outline" size="sm" onClick={handleRefresh}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </div>
        </header>

        {loading ? (
          <Skeleton className="h-80 w-full" />
        ) : error ? (
          <EmptyState inline title="Lead Recovery unavailable" description={error} />
        ) : (
          <>
            <Card>
              <CardHeader className="flex flex-col items-start justify-between sm:flex-row gap-4">
                <div>
                  <CardTitle>Setup status</CardTitle>
                  <CardDescription>
                    Keep your current business phone number. Forward missed or unanswered calls to your recovery number.
                    When a caller is missed, we&apos;ll text them automatically, collect details, and send the lead back to you.
                  </CardDescription>
                </div>
                <Badge variant={connected ? "success" : settings?.forwarding_status === "error" || settings?.forwarding_status === "failed" ? "danger" : "warning"}>
                  {statusLabels[settings?.forwarding_status ?? "not_configured"] ?? settings?.forwarding_status}
                </Badge>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-3">
                <StatusBlock label="Lead Recovery" value={settings?.enabled ? "Enabled" : "Disabled"} />
                <StatusBlock label="Recovery number" value={settings?.twilio_phone_number || "Not assigned"} />
                <StatusBlock
                  label="Owner notifications"
                  value={settings?.owner_notification_phone || settings?.owner_notification_email || "Not configured"}
                />
              </CardContent>
            </Card>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="space-y-5">
                <Card>
                  <CardHeader>
                    <CardTitle>Call forwarding instructions</CardTitle>
                    <CardDescription>
                      Set up conditional call forwarding with your phone provider so unanswered or busy calls forward to your
                      recovery number.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
	                    <div className="grid gap-3 md:grid-cols-2">
	                      <TextField label="Business phone number" value={draft.business_phone} onChange={(value) => setDraftField("business_phone", value, setDraft)} />
	                      <TextField label="Owner notification phone" value={draft.owner_notification_phone} onChange={(value) => setDraftField("owner_notification_phone", value, setDraft)} />
	                      <TextField label="Owner notification email" value={draft.owner_notification_email} onChange={(value) => setDraftField("owner_notification_email", value, setDraft)} />
	                      <TextField label="Recovery number" value={draft.twilio_phone_number} onChange={(value) => setDraftField("twilio_phone_number", value, setDraft)} />
	                      <TextField label="Business display name" value={draft.business_name} onChange={(value) => setDraftField("business_name", value, setDraft)} />
	                      <TextField label="Test call from phone" value={draft.test_call_from_phone} onChange={(value) => setDraftField("test_call_from_phone", value, setDraft)} />
	                    </div>
	                    {settings?.forwarding_status === "skipped" && (
	                      <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
	                        Lead Recovery was skipped during onboarding. Save setup details here to finish activation.
	                      </div>
	                    )}
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={() => saveSettings()} disabled={saving}>
                        <Save className="mr-2 h-4 w-4" />
                        {saving ? "Saving..." : "Save setup"}
                      </Button>
                      <Button variant="outline" onClick={markForwardingSetup} disabled={saving}>
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Mark forwarding as set up
                      </Button>
                      <Button variant="outline" onClick={testSetup}>
                        <Send className="mr-2 h-4 w-4" />
                        Test setup
                      </Button>
                    </div>
                    {message && <p className="text-sm font-medium text-foreground">{message}</p>}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Lead inbox</CardTitle>
                    <CardDescription>Recovered missed calls and SMS conversations</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {leads.length === 0 ? (
                      <EmptyState
                        inline
                        title="No recovered leads yet"
                        description="Recover missed opportunities automatically. When a caller reaches your business and you miss the call, we text them, collect details, and send the lead back to you."
                      />
                    ) : (
                      <Table>
                        <THead>
                          <TR>
                            <TH>Customer</TH>
                            <TH>Source</TH>
                            <TH>Status</TH>
                            <TH>Urgency</TH>
                            <TH>Service</TH>
                            <TH>City/location</TH>
                            <TH>Last message</TH>
                            <TH>Created</TH>
                            <TH>Actions</TH>
                          </TR>
                        </THead>
                        <TBody>
                          {leads.map((lead) => (
                            <TR key={lead.id}>
                              <TD>
                                <div className="font-medium">{lead.customer_name || "Unknown"}</div>
                                <div className="text-xs text-muted-foreground">{lead.customer_phone || "No phone"}</div>
                              </TD>
                              <TD>{sourceLabel(lead.source)}</TD>
                              <TD>
                                <Badge variant={statusVariant(lead.status)}>{lead.status.replaceAll("_", " ")}</Badge>
                              </TD>
                              <TD>{lead.urgency || "-"}</TD>
                              <TD>{lead.service_requested || "-"}</TD>
                              <TD>{lead.location || "-"}</TD>
                              <TD className="max-w-[220px] truncate">{lead.last_message || lead.details || "-"}</TD>
                              <TD>{lead.created_at ? format(lead.created_at) : "-"}</TD>
                              <TD>
                                <div className="flex flex-wrap gap-1">
                                  <Button size="sm" variant="outline" onClick={() => openLead(lead.id)}>View</Button>
                                  <Button size="sm" variant="outline" onClick={() => markLead(lead.id, "contacted")}>Contacted</Button>
                                  <Button size="sm" variant="outline" onClick={() => markLead(lead.id, "booked")}>Booked</Button>
                                  <Button size="sm" variant="outline" onClick={() => markLead(lead.id, "lost")}>Lost</Button>
                                  <Button size="sm" variant="outline" onClick={() => markLead(lead.id, "completed")}>Completed</Button>
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

              <div className="space-y-5">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Settings2 className="h-4 w-4" />
                      Automation settings
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <ToggleRow label="Enable Lead Recovery" checked={Boolean(draft.enabled)} onChange={(value) => setDraftField("enabled", value, setDraft)} />
                    <ToggleRow label="Enable missed call text-back" checked={Boolean(draft.missed_call_textback_enabled)} onChange={(value) => setDraftField("missed_call_textback_enabled", value, setDraft)} />
                    <ToggleRow label="Enable customer intake questions" checked={Boolean(draft.intake_questions_enabled)} onChange={(value) => setDraftField("intake_questions_enabled", value, setDraft)} />
                    <ToggleRow label="Enable owner notifications" checked={Boolean(draft.owner_notifications_enabled)} onChange={(value) => setDraftField("owner_notifications_enabled", value, setDraft)} />
                    <ToggleRow label="Enable follow-up if customer does not respond" checked={Boolean(draft.no_response_followup_enabled)} onChange={(value) => setDraftField("no_response_followup_enabled", value, setDraft)} />
                    <ToggleRow label="Enable review request after completed job" checked={Boolean(draft.completed_job_review_request_enabled)} onChange={(value) => setDraftField("completed_job_review_request_enabled", value, setDraft)} />
                    <Button className="w-full" onClick={() => saveSettings()} disabled={saving}>Save automation</Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Bell className="h-4 w-4" />
                      Lead detail
                    </CardTitle>
                    <CardDescription>{selectedLead ? "Conversation, summary, and status" : "Select a lead to inspect it"}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {!selectedLead ? (
                      <EmptyState inline title="No lead selected" description="Open a recovered lead from the inbox." />
                    ) : (
                      <div className="space-y-4 text-sm">
                        <div className="space-y-1">
                          <div className="font-semibold">{selectedLead.customer_name || "Unknown customer"}</div>
                          <div className="text-muted-foreground">{selectedLead.customer_phone || "No phone"}</div>
                          <div className="text-muted-foreground">{selectedLead.customer_email || "No email"}</div>
                        </div>
                        <label className="block">
                          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</span>
                          <select
                            value={selectedLead.status}
                            onChange={(event) => saveLeadStatus(event.target.value)}
                            className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2"
                          >
                            {leadStatuses.map((status) => (
                              <option key={status} value={status}>{status.replaceAll("_", " ")}</option>
                            ))}
                          </select>
                        </label>
                        <DetailGrid lead={selectedLead} />
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Owner summary</p>
                          <p className="mt-1 whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-3">
                            {selectedLead.owner_summary || "Not sent yet"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Conversation</p>
                          <div className="mt-2 max-h-56 space-y-2 overflow-auto">
                            {selectedLead.messages.length === 0 ? (
                              <p className="text-muted-foreground">No messages yet.</p>
                            ) : (
                              selectedLead.messages.map((item) => (
                                <div key={item.id} className="rounded-lg border border-border p-2">
                                  <div className="flex justify-between gap-2 text-xs text-muted-foreground">
                                    <span>{item.direction} / {item.channel}</span>
                                    <span>{format(item.created_at)}</span>
                                  </div>
                                  <p className="mt-1">{item.body || "-"}</p>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Internal notes</p>
                          <textarea
                            value={note}
                            onChange={(event) => setNote(event.target.value)}
                            className="mt-2 min-h-20 w-full rounded-lg border border-border bg-white px-3 py-2"
                          />
                          <Button size="sm" className="mt-2" onClick={addNote}>Add note</Button>
                          <div className="mt-3 space-y-2">
                            {selectedLead.notes.map((item) => (
                              <div key={item.id} className="rounded-lg bg-muted/40 p-2">
                                <p>{item.note}</p>
                                <p className="mt-1 text-xs text-muted-foreground">{format(item.created_at)}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="rounded-lg border border-border bg-muted/30 p-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Suggested next action</p>
                          <p className="mt-1">{selectedLead.suggested_next_action}</p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardShell>
  );
}

function StatusBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  );
}

function TextField({ label, value, onChange }: { label: string; value?: string | null; onChange: (value: string) => void }) {
  return (
    <label className="text-sm">
      {label}
      <input
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2"
      />
    </label>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4" />
    </label>
  );
}

function DetailGrid({ lead }: { lead: LeadDetail }) {
  const rows = [
    ["Service requested", lead.service_requested || "-"],
    ["City/location", lead.location || "-"],
    ["Urgency", lead.urgency || "-"],
    ["Preferred time", lead.preferred_time || "-"],
    ["Source", sourceLabel(lead.source)],
    ["Details", lead.details || "-"],
  ];
  return (
    <div className="grid gap-2">
      {rows.map(([label, value]) => (
        <div key={label} className="rounded-lg border border-border p-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-1 whitespace-pre-wrap">{value}</p>
        </div>
      ))}
    </div>
  );
}

function setDraftField<Key extends keyof LeadRecoverySettings>(
  key: Key,
  value: LeadRecoverySettings[Key],
  setDraft: Dispatch<SetStateAction<Partial<LeadRecoverySettings>>>,
) {
  setDraft((current) => ({ ...current, [key]: value }));
}

function cleanPayload(payload: Partial<LeadRecoverySettings>) {
  return Object.fromEntries(
    Object.entries(payload).filter(([key, value]) => key !== "id" && key !== "tenant_id" && value !== undefined),
  );
}

function sourceLabel(source: string) {
  if (source === "missed_call") return "Missed Call";
  if (source === "sms") return "SMS";
  return source.replaceAll("_", " ");
}

function statusVariant(status: string): "default" | "outline" | "success" | "warning" | "danger" | "muted" {
  if (["qualified", "booked", "completed"].includes(status)) return "success";
  if (["lost"].includes(status)) return "danger";
  if (["new", "auto_contacted", "responded"].includes(status)) return "warning";
  return "muted";
}

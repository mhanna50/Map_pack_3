"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/features/admin/components/shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { adminApi } from "@/features/admin/adminApiClient";
import { formatDate } from "@/lib/date-utils";
import { useToast } from "@/components/ui/toast";
import { ChevronDown } from "lucide-react";

type Subscription = {
  tenant_id: string;
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
  status?: string;
  plan?: string;
  location_limit?: number;
  current_period_end?: string;
  metadata_json?: { cancel_at_period_end?: boolean } | null;
};

type PaymentIssue = Subscription & { client_name?: string; account_paused?: boolean };
type MonthlySummary = {
  month: string;
  gross_revenue: number;
  recurring_expenses: number;
  one_time_expenses: number;
  profit_before_tax: number;
  tax_set_aside: number;
  net_after_tax_and_expenses: number;
  paying_clients: number;
  revenue_lines?: Array<{
    source?: string;
    client_name?: string;
    plan?: string | null;
    status?: string | null;
    stripe_subscription_id?: string | null;
    amount?: number;
    occurred_at?: string | null;
  }>;
  expense_lines?: Array<{
    id?: string;
    name?: string;
    category?: string | null;
    expense_type?: string;
    recurrence_interval?: string | null;
    amount?: number;
    original_amount?: number;
    occurred_on?: string | null;
    starts_on?: string | null;
    ends_on?: string | null;
  }>;
};
type Expense = {
  id?: string;
  name?: string;
  category?: string | null;
  amount_cents?: number;
  expense_type?: "one_time" | "recurring";
  recurrence_interval?: "monthly" | "quarterly" | "yearly" | null;
  occurred_on?: string;
  starts_on?: string | null;
  ends_on?: string | null;
};
type FinanceSettings = {
  pa_income_tax_rate?: number;
  federal_income_tax_rate?: number;
  self_employment_tax_rate?: number;
  self_employment_taxable_ratio?: number;
  local_tax_rate?: number;
  additional_tax_rate?: number;
  notes?: string | null;
};
type BillingPayload = {
  rows?: Subscription[];
  payment_issues?: PaymentIssue[];
  expenses?: Expense[];
  finance_settings?: FinanceSettings;
  monthly_summary?: MonthlySummary[];
  lifetime_client_revenue?: Array<{ client_name: string; total_revenue: number; months: number }>;
};

const defaultExpense = {
  name: "",
  category: "",
  amount: "",
  expense_type: "one_time",
  recurrence_interval: "monthly",
  occurred_on: new Date().toISOString().slice(0, 10),
  starts_on: new Date().toISOString().slice(0, 10),
  ends_on: "",
};

export default function BillingPage() {
  const { pushToast } = useToast();
  const [payload, setPayload] = useState<BillingPayload>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);
  const [taxSettingsOpen, setTaxSettingsOpen] = useState(true);
  const [expenseDraft, setExpenseDraft] = useState(defaultExpense);
  const [settingsDraft, setSettingsDraft] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = (await adminApi.billing()) as BillingPayload;
      setPayload(data);
      setSettingsDraft(settingsToDraft(data.finance_settings ?? {}));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load billing");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const currentMonth = payload.monthly_summary?.[0];
  const subs = payload.rows ?? [];
  const paymentIssues = payload.payment_issues ?? [];
  const expenses = payload.expenses ?? [];

  const totals = useMemo(
    () => ({
      mrr: currentMonth?.gross_revenue ?? 0,
      net: currentMonth?.net_after_tax_and_expenses ?? 0,
      tax: currentMonth?.tax_set_aside ?? 0,
      expenses: (currentMonth?.recurring_expenses ?? 0) + (currentMonth?.one_time_expenses ?? 0),
    }),
    [currentMonth],
  );

  const saveSettings = async () => {
    setSaving(true);
    try {
      await adminApi.billingAction({
        action: "save_finance_settings",
        settings: draftToSettings(settingsDraft),
      });
      pushToast({ title: "Tax settings saved", tone: "success" });
      await load();
    } catch (err: unknown) {
      pushToast({ title: "Could not save settings", description: err instanceof Error ? err.message : "Unknown error", tone: "error" });
    } finally {
      setSaving(false);
    }
  };

  const addExpense = async () => {
    setSaving(true);
    try {
      await adminApi.billingAction({ action: "add_expense", expense: expenseDraft });
      setExpenseDraft(defaultExpense);
      pushToast({ title: "Expense saved", tone: "success" });
      await load();
    } catch (err: unknown) {
      pushToast({ title: "Could not save expense", description: err instanceof Error ? err.message : "Unknown error", tone: "error" });
    } finally {
      setSaving(false);
    }
  };

  const deleteExpense = async (id?: string) => {
    if (!id) return;
    setSaving(true);
    try {
      await adminApi.billingAction({ action: "delete_expense", id });
      await load();
    } catch (err: unknown) {
      pushToast({ title: "Could not delete expense", description: err instanceof Error ? err.message : "Unknown error", tone: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminShell>
      <div className="space-y-5">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Billing</p>
          <h1 className="text-2xl font-semibold">Revenue, payments & tax set-aside</h1>
          <p className="text-sm text-muted-foreground">
            Tracks active subscriptions, failed-payment risk, stored expense records, and monthly owner finance snapshots.
          </p>
        </div>

        {loading ? (
          <Skeleton className="h-96 w-full" />
        ) : error ? (
          <EmptyState inline title="Could not load billing" description={error} />
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-4">
              <Metric label="Monthly subscription revenue" value={money(totals.mrr)} />
              <Metric label="Tax set-aside estimate" value={money(totals.tax)} tone="warning" />
              <Metric label="This month's expenses" value={money(totals.expenses)} />
              <Metric label="Net after taxes/expenses" value={money(totals.net)} tone={totals.net >= 0 ? "success" : "danger"} />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Failed payments & paused accounts</CardTitle>
                <CardDescription>Shows subscriptions that need payment attention and whether access/automations appear paused.</CardDescription>
              </CardHeader>
              <CardContent>
                {paymentIssues.length ? (
                  <Table>
                    <THead>
                      <TR>
                        <TH>Client</TH>
                        <TH>Status</TH>
                        <TH>Paused</TH>
                        <TH>Plan</TH>
                        <TH>Period end</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {paymentIssues.map((issue) => (
                        <TR key={issue.stripe_subscription_id ?? issue.tenant_id}>
                          <TD>
                            <div className="font-semibold">{issue.client_name ?? issue.tenant_id}</div>
                            <p className="text-xs text-muted-foreground">{issue.stripe_customer_id}</p>
                          </TD>
                          <TD><Badge variant={statusVariant(issue.status)}>{issue.status ?? "unknown"}</Badge></TD>
                          <TD><Badge variant={issue.account_paused ? "warning" : "muted"}>{issue.account_paused ? "Paused" : "Not paused"}</Badge></TD>
                          <TD>{issue.plan ?? "-"}</TD>
                          <TD>{formatDate(issue.current_period_end)}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                ) : (
                  <EmptyState inline title="No failed-payment or paused-account issues" />
                )}
              </CardContent>
            </Card>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
              <Card>
                <CardHeader>
                  <CardTitle>Monthly revenue history</CardTitle>
                  <CardDescription>Stored ledger totals remain available even if a client later leaves.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <THead>
                      <TR>
                        <TH>Month</TH>
                        <TH>Gross</TH>
                        <TH>Recurring expenses</TH>
                        <TH>One-time expenses</TH>
                        <TH>Tax set-aside</TH>
                        <TH>Net</TH>
                        <TH>Details</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {(payload.monthly_summary ?? []).map((month) => (
                        <Fragment key={month.month}>
                          <TR key={month.month}>
                            <TD>{month.month}</TD>
                            <TD>{money(month.gross_revenue)}</TD>
                            <TD>{money(month.recurring_expenses)}</TD>
                            <TD>{money(month.one_time_expenses)}</TD>
                            <TD>{money(month.tax_set_aside)}</TD>
                            <TD className="font-semibold">{money(month.net_after_tax_and_expenses)}</TD>
                            <TD>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setExpandedMonth((current) => (current === month.month ? null : month.month))}
                              >
                                {expandedMonth === month.month ? "Hide" : "View"}
                              </Button>
                            </TD>
                          </TR>
                          {expandedMonth === month.month && (
                            <TR key={`${month.month}-details`}>
                              <TD colSpan={7}>
                                <MonthDetails month={month} />
                              </TD>
                            </TR>
                          )}
                        </Fragment>
                      ))}
                    </TBody>
                  </Table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                  <div className="space-y-1.5">
                    <CardTitle>Tax settings</CardTitle>
                    <CardDescription>Defaults include PA 3.07% and IRS self-employment 15.3%; update for your CPA/tax situation.</CardDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={taxSettingsOpen ? "Collapse tax settings" : "Expand tax settings"}
                    aria-expanded={taxSettingsOpen}
                    onClick={() => setTaxSettingsOpen((open) => !open)}
                  >
                    <ChevronDown className={`h-4 w-4 transition-transform ${taxSettingsOpen ? "rotate-180" : ""}`} />
                  </Button>
                </CardHeader>
                {taxSettingsOpen && (
                  <CardContent className="space-y-3">
                    <RateInput label="PA income tax" field="pa_income_tax_rate" values={settingsDraft} setValues={setSettingsDraft} />
                    <RateInput label="Federal income tax" field="federal_income_tax_rate" values={settingsDraft} setValues={setSettingsDraft} />
                    <RateInput label="Self-employment tax" field="self_employment_tax_rate" values={settingsDraft} setValues={setSettingsDraft} />
                    <RateInput label="Local tax" field="local_tax_rate" values={settingsDraft} setValues={setSettingsDraft} />
                    <RateInput label="Additional buffer" field="additional_tax_rate" values={settingsDraft} setValues={setSettingsDraft} />
                    <Button className="w-full" onClick={saveSettings} disabled={saving}>Save tax settings</Button>
                    <p className="text-xs text-muted-foreground">
                      Estimate only. Federal income tax, local PA tax, deductions, and LLC tax treatment can change the real amount.
                    </p>
                  </CardContent>
                )}
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Business expenses</CardTitle>
                <CardDescription>Store one-time purchases and recurring operating costs like hosting, AI, phone, and other services.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-6">
                  <Input placeholder="Expense name" value={expenseDraft.name} onChange={(event) => setExpenseDraft((draft) => ({ ...draft, name: event.target.value }))} />
                  <Input placeholder="Category" value={expenseDraft.category} onChange={(event) => setExpenseDraft((draft) => ({ ...draft, category: event.target.value }))} />
                  <Input placeholder="Amount" type="number" min="0" step="0.01" value={expenseDraft.amount} onChange={(event) => setExpenseDraft((draft) => ({ ...draft, amount: event.target.value }))} />
                  <Select value={expenseDraft.expense_type} onChange={(event) => setExpenseDraft((draft) => ({ ...draft, expense_type: event.target.value }))} options={[{ label: "One-time", value: "one_time" }, { label: "Recurring", value: "recurring" }]} />
                  <Select value={expenseDraft.recurrence_interval} onChange={(event) => setExpenseDraft((draft) => ({ ...draft, recurrence_interval: event.target.value }))} options={[{ label: "Monthly", value: "monthly" }, { label: "Quarterly", value: "quarterly" }, { label: "Yearly", value: "yearly" }]} />
                  <Button onClick={addExpense} disabled={saving}>Add expense</Button>
                </div>

                {expenses.length ? (
                  <Table>
                    <THead>
                      <TR>
                        <TH>Name</TH>
                        <TH>Type</TH>
                        <TH>Amount</TH>
                        <TH>Date/start</TH>
                        <TH>Action</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {expenses.map((expense) => (
                        <TR key={expense.id}>
                          <TD>
                            <div className="font-semibold">{expense.name}</div>
                            <p className="text-xs text-muted-foreground">{expense.category}</p>
                          </TD>
                          <TD>{expense.expense_type === "recurring" ? `Recurring ${expense.recurrence_interval ?? "monthly"}` : "One-time"}</TD>
                          <TD>{money((expense.amount_cents ?? 0) / 100)}</TD>
                          <TD>{expense.expense_type === "recurring" ? formatDate(expense.starts_on ?? expense.occurred_on) : formatDate(expense.occurred_on)}</TD>
                          <TD><Button variant="ghost" size="sm" onClick={() => deleteExpense(expense.id)} disabled={saving}>Delete</Button></TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                ) : (
                  <EmptyState inline title="No business expenses stored yet" />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Subscriptions</CardTitle>
                <CardDescription>Current Stripe subscription state used for MRR snapshots and payment monitoring.</CardDescription>
              </CardHeader>
              <CardContent>
                {subs.length === 0 ? (
                  <EmptyState inline title="No subscriptions" />
                ) : (
                  <Table>
                    <THead>
                      <TR>
                        <TH>Tenant</TH>
                        <TH>Status</TH>
                        <TH>Plan</TH>
                        <TH>Location limit</TH>
                        <TH>Renews / access ends</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {subs.map((sub) => (
                        <TR key={sub.stripe_subscription_id ?? sub.tenant_id}>
                          <TD>
                            <div className="font-semibold">{sub.tenant_id}</div>
                            <p className="text-xs text-muted-foreground">{sub.stripe_customer_id}</p>
                          </TD>
                          <TD><Badge variant={statusVariant(sub.status, sub.metadata_json?.cancel_at_period_end)}>{sub.metadata_json?.cancel_at_period_end ? "canceling" : sub.status ?? "unknown"}</Badge></TD>
                          <TD className="capitalize">{sub.plan ?? "-"}</TD>
                          <TD>{sub.location_limit ?? "-"}</TD>
                          <TD>{formatDate(sub.current_period_end)}</TD>
                        </TR>
                      ))}
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

function Metric({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "success" | "warning" | "danger" }) {
  const toneClass = tone === "success" ? "border-emerald-200" : tone === "warning" ? "border-amber-200" : tone === "danger" ? "border-red-200" : "";

  return (
    <Card className={`h-full ${toneClass}`}>
      <CardContent className="flex min-h-24 items-center justify-between gap-3 px-5 py-4 sm:py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function MonthDetails({ month }: { month: MonthlySummary }) {
  const revenueLines = month.revenue_lines ?? [];
  const expenseLines = month.expense_lines ?? [];
  return (
    <div className="grid gap-4 rounded-lg border border-border bg-muted/30 p-4 md:grid-cols-2">
      <div>
        <p className="text-sm font-semibold">Payment sources</p>
        {revenueLines.length ? (
          <div className="mt-2 space-y-2">
            {revenueLines.map((line, index) => (
              <div key={`${line.stripe_subscription_id ?? line.client_name}-${index}`} className="rounded-lg border border-border bg-white px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">{line.client_name ?? "Client"}</span>
                  <span className="font-semibold">{money(line.amount ?? 0)}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {String(line.source ?? "subscription").replaceAll("_", " ")}
                  {line.plan ? ` · ${line.plan}` : ""}
                  {line.status ? ` · ${line.status}` : ""}
                </p>
                {line.stripe_subscription_id && <p className="mt-1 break-all text-xs text-muted-foreground">{line.stripe_subscription_id}</p>}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">No payment ledger rows stored for this month.</p>
        )}
      </div>

      <div>
        <p className="text-sm font-semibold">Expenses applied</p>
        {expenseLines.length ? (
          <div className="mt-2 space-y-2">
            {expenseLines.map((line, index) => (
              <div key={`${line.id ?? line.name}-${index}`} className="rounded-lg border border-border bg-white px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">{line.name ?? "Expense"}</span>
                  <span className="font-semibold">{money(line.amount ?? 0)}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {line.expense_type === "recurring" ? `Recurring ${line.recurrence_interval ?? "monthly"}` : "One-time"}
                  {line.category ? ` · ${line.category}` : ""}
                </p>
                {line.original_amount !== line.amount && (
                  <p className="mt-1 text-xs text-muted-foreground">Original charge: {money(line.original_amount ?? 0)}</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">No business expenses applied to this month.</p>
        )}
      </div>
    </div>
  );
}

function RateInput({ label, field, values, setValues }: { label: string; field: string; values: Record<string, string>; setValues: React.Dispatch<React.SetStateAction<Record<string, string>>> }) {
  return (
    <label className="block text-sm">
      <span className="font-medium">{label}</span>
      <Input
        className="mt-1"
        type="number"
        min="0"
        step="0.01"
        value={values[field] ?? ""}
        onChange={(event) => setValues((current) => ({ ...current, [field]: event.target.value }))}
      />
    </label>
  );
}

function settingsToDraft(settings: FinanceSettings) {
  return {
    pa_income_tax_rate: percent(settings.pa_income_tax_rate ?? 0.0307),
    federal_income_tax_rate: percent(settings.federal_income_tax_rate ?? 0),
    self_employment_tax_rate: percent(settings.self_employment_tax_rate ?? 0.153),
    local_tax_rate: percent(settings.local_tax_rate ?? 0),
    additional_tax_rate: percent(settings.additional_tax_rate ?? 0),
  };
}

function draftToSettings(draft: Record<string, string>) {
  return Object.fromEntries(Object.entries(draft).map(([key, value]) => [key, Number(value || 0) / 100]));
}

function percent(value: number) {
  return String(Math.round(value * 10000) / 100);
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value || 0);
}

function statusVariant(status?: string, canceling?: boolean) {
  if (canceling) return "warning";
  switch (status) {
    case "active":
    case "trialing":
      return "success";
    case "past_due":
    case "paused":
    case "unpaid":
    case "incomplete":
      return "warning";
    case "canceled":
    case "churned":
      return "danger";
    default:
      return "muted";
  }
}

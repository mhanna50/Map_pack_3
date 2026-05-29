"use client";

import { useEffect, useState } from "react";
import { DashboardShell } from "@/features/dashboard/components/shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import { Dialog } from "@/components/ui/dialog";
import { useTenant } from "@/features/tenants/tenant-context";
import { fetchBackendJson } from "@/lib/backend-api";

type Subscription = {
  status?: string | null;
  plan?: string | null;
  current_period_end?: string | null;
  canceled_at?: string | null;
  retention_until?: string | null;
  cancel_at_period_end?: boolean;
  can_cancel?: boolean;
  can_reactivate?: boolean;
  access_active?: boolean;
};

const tabItems = [
  { value: "account", label: "Account" },
  { value: "accessibility", label: "Accessibility" },
  { value: "billing", label: "Billing" },
  { value: "legal", label: "Legal" },
];

export default function SettingsPage() {
  const { tenantId } = useTenant();
  const [tab, setTab] = useState("account");
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loadingSub, setLoadingSub] = useState(false);
  const [billingBusy, setBillingBusy] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);

  useEffect(() => {
    const requestedTab = new URLSearchParams(window.location.search).get("tab");
    if (requestedTab && tabItems.some((item) => item.value === requestedTab)) {
      setTab(requestedTab);
    }
  }, []);

  useEffect(() => {
    if (!tenantId) return;
    let active = true;
    const load = async () => {
      setLoadingSub(true);
      setBillingError(null);
      try {
        const sub = await fetchBackendJson<Subscription>("/billing/subscription");
        if (active) setSubscription(sub);
      } catch (error) {
        if (active) setBillingError(error instanceof Error ? error.message : "Unable to load billing");
      } finally {
        if (active) setLoadingSub(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [tenantId]);

  const confirmCancel = async () => {
    setBillingBusy(true);
    setBillingError(null);
    try {
      const sub = await fetchBackendJson<Subscription>("/billing/subscription/cancel", { method: "POST" });
      setSubscription(sub);
      setCancelOpen(false);
    } catch (error) {
      setBillingError(error instanceof Error ? error.message : "Unable to cancel subscription");
    } finally {
      setBillingBusy(false);
    }
  };

  return (
    <DashboardShell>
      <div className="space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Settings</p>
            <h1 className="text-2xl font-semibold">Account, billing, and preferences</h1>
          </div>
          <Badge variant="muted">Map Pack 3</Badge>
        </header>

        <Tabs tabs={tabItems} value={tab} onValueChange={setTab} />

        {tab === "account" && <AccountTab />}
        {tab === "accessibility" && <AccessibilityTab />}
        {tab === "billing" && (
          <BillingTab
            subscription={subscription}
            loading={loadingSub}
            error={billingError}
            onCancel={() => setCancelOpen(true)}
          />
        )}
        {tab === "legal" && <LegalTab />}
      </div>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen} title="Cancel subscription" description="Your subscription will remain active through the current paid period.">
        <p className="text-sm text-muted-foreground">
          We will schedule cancellation in Stripe at the end of your current billing period and keep your account information for at least 3 months so you can reactivate without a new invite.
        </p>
        <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-3">
          <Button variant="ghost" onClick={() => setCancelOpen(false)} disabled={billingBusy}>
            Keep plan
          </Button>
          <Button variant="destructive" onClick={confirmCancel} disabled={billingBusy}>
            {billingBusy ? "Canceling..." : "Confirm cancel"}
          </Button>
        </div>
      </Dialog>
    </DashboardShell>
  );
}

function AccountTab() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Login and notifications</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <label className="block">
            <span className="text-muted-foreground">Email</span>
            <input className="mt-1 w-full rounded-lg border border-border px-3 py-2" placeholder="you@company.com" />
          </label>
          <p className="text-xs text-muted-foreground">Change login method: handled in Auth; link your provider in the auth settings.</p>
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2">
            <span>Email updates</span>
            <input type="checkbox" defaultChecked className="h-4 w-4 accent-primary" />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2">
            <span>Product announcements</span>
            <input type="checkbox" className="h-4 w-4 accent-primary" />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>Email + SMS</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span>Daily summary</span>
            <input type="checkbox" defaultChecked className="h-4 w-4 accent-primary" />
          </div>
          <div className="flex items-center justify-between">
            <span>Approval queue alerts</span>
            <input type="checkbox" defaultChecked className="h-4 w-4 accent-primary" />
          </div>
          <div className="flex items-center justify-between">
            <span>Support updates</span>
            <input type="checkbox" className="h-4 w-4 accent-primary" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AccessibilityTab() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Accessibility</CardTitle>
        <CardDescription>Controls for readability</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-center justify-between">
          <span>High contrast</span>
          <input type="checkbox" className="h-4 w-4 accent-primary" />
        </div>
        <div className="flex items-center justify-between">
          <span>Large text</span>
          <input type="checkbox" className="h-4 w-4 accent-primary" />
        </div>
        <div className="flex items-center justify-between">
          <span>Reduce motion</span>
          <input type="checkbox" className="h-4 w-4 accent-primary" />
        </div>
      </CardContent>
    </Card>
  );
}

function BillingTab({
  subscription,
  loading,
  error,
  onCancel,
}: {
  subscription: Subscription | null;
  loading: boolean;
  error: string | null;
  onCancel: () => void;
}) {
  const cancelsOn = subscription?.current_period_end
    ? new Date(subscription.current_period_end).toLocaleDateString()
    : null;
  const statusLabel = subscription?.cancel_at_period_end && cancelsOn
    ? `Canceling on ${cancelsOn}`
    : subscription?.status ?? "Unavailable";

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Current plan</CardTitle>
          <CardDescription>Status and renewal</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span>Plan</span>
            <span className="font-semibold">{subscription?.plan ?? "Map Pack 3"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Status</span>
            <Badge variant={subscription?.access_active ? "success" : "muted"}>
              {loading ? "Loading..." : statusLabel}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span>{subscription?.cancel_at_period_end ? "Access through" : "Renews"}</span>
            <span className="text-muted-foreground">
              {subscription?.current_period_end ? new Date(subscription.current_period_end).toLocaleDateString() : "—"}
            </span>
          </div>
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <Button variant="destructive" onClick={onCancel} disabled={!subscription?.can_cancel || loading}>
            {subscription?.cancel_at_period_end ? "Cancellation scheduled" : "Cancel subscription"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function LegalTab() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Legal</CardTitle>
        <CardDescription>Privacy and terms</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <a className="text-primary underline" href="/privacy" target="_blank" rel="noreferrer">
          Privacy policy
        </a>
        <a className="text-primary underline" href="/terms" target="_blank" rel="noreferrer">
          Terms of service
        </a>
      </CardContent>
    </Card>
  );
}

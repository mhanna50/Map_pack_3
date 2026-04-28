"use client";

import { useEffect, useState } from "react";
import { DashboardShell } from "@/features/dashboard/components/shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import { Dialog } from "@/components/ui/dialog";
import { useTenant } from "@/features/tenants/tenant-context";
import { getBillingSubscription } from "@/lib/db";

type Subscription = {
  seats_or_locations?: number;
  status?: string;
  plan?: string;
  current_period_end?: string;
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
  const [cancelOpen, setCancelOpen] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    let active = true;
    const load = async () => {
      setLoadingSub(true);
      const sub = await getBillingSubscription(tenantId);
      if (active) {
        setSubscription(sub);
        setLoadingSub(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [tenantId]);

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
            onCancel={() => setCancelOpen(true)}
          />
        )}
        {tab === "legal" && <LegalTab />}
      </div>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen} title="Cancel subscription" description="This is a placeholder confirmation.">
        <p className="text-sm text-muted-foreground">Hook this dialog to your billing provider to cancel safely.</p>
        <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-3">
          <Button variant="ghost" onClick={() => setCancelOpen(false)}>
            Keep plan
          </Button>
          <Button variant="destructive" onClick={() => setCancelOpen(false)}>
            Confirm cancel
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
  onCancel,
}: {
  subscription: Subscription | null;
  loading: boolean;
  onCancel: () => void;
}) {
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
            <span className="font-semibold">Map Pack 3</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Status</span>
            <Badge variant={subscription?.status === "active" ? "success" : "muted"}>
              {loading ? "Loading..." : subscription?.status ?? "Placeholder"}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span>Renews</span>
            <span className="text-muted-foreground">
              {subscription?.current_period_end ? new Date(subscription.current_period_end).toLocaleDateString() : "—"}
            </span>
          </div>
          <Button variant="destructive" onClick={onCancel}>
            Cancel subscription
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

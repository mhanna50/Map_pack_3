"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fetchBackendJson } from "@/lib/backend-api";

type SubscriptionStatus = {
  status?: string | null;
  plan?: string | null;
  current_period_end?: string | null;
  retention_until?: string | null;
  cancel_at_period_end?: boolean;
  can_cancel?: boolean;
  can_reactivate?: boolean;
  access_active?: boolean;
  checkout_url?: string | null;
};

export default function SubscriptionAccountPage() {
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [reactivating, setReactivating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const status = await fetchBackendJson<SubscriptionStatus>("/billing/subscription");
        if (active) setSubscription(status);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Unable to load subscription");
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  const reactivate = async () => {
    setReactivating(true);
    setError(null);
    try {
      const response = await fetchBackendJson<SubscriptionStatus>("/billing/subscription/reactivate", {
        method: "POST",
      });
      if (response.checkout_url) {
        window.location.assign(response.checkout_url);
        return;
      }
      setSubscription(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reactivate subscription");
    } finally {
      setReactivating(false);
    }
  };

  const periodEnd = subscription?.current_period_end
    ? new Date(subscription.current_period_end).toLocaleDateString()
    : null;
  const retentionUntil = subscription?.retention_until
    ? new Date(subscription.retention_until).toLocaleDateString()
    : null;
  const canceled = !subscription?.access_active;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-2xl space-y-4">
        <Link href="/" className="text-sm font-semibold text-primary">
          Map Pack 3
        </Link>
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>{canceled ? "Your subscription is canceled" : "Subscription"}</CardTitle>
                <CardDescription>
                  Reactivate your account without a new admin invite.
                </CardDescription>
              </div>
              <Badge variant={subscription?.access_active ? "success" : "danger"}>
                {loading ? "Loading" : subscription?.status ?? "Canceled"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {error && <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-rose-700">{error}</p>}
            <div className="rounded-lg border border-border bg-white px-3 py-2">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Plan</span>
                <span className="font-semibold">{subscription?.plan ?? "Map Pack 3"}</span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-muted-foreground">
                  {subscription?.cancel_at_period_end ? "Access through" : "Last paid period"}
                </span>
                <span>{periodEnd ?? "Not available"}</span>
              </div>
              {retentionUntil && (
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-muted-foreground">Account kept until</span>
                  <span>{retentionUntil}</span>
                </div>
              )}
            </div>
            {canceled ? (
              <p className="text-muted-foreground">
                Your dashboard access is paused because the paid subscription period has ended. Your login, business profile, locations, and onboarding data remain on file during the 3-month retention window.
              </p>
            ) : (
              <p className="text-muted-foreground">
                Your subscription is still active. Continue to the dashboard or reactivate the scheduled cancellation if needed.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button onClick={reactivate} disabled={reactivating || loading}>
                {reactivating ? "Opening Stripe..." : "Reactivate subscription"}
              </Button>
              {subscription?.access_active && (
                <Link className="rounded-lg border border-border px-4 py-2 font-semibold" href="/dashboard">
                  Continue to dashboard
                </Link>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

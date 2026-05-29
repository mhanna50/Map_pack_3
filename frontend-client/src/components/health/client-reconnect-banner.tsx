"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { fetchBackendJson } from "@/lib/backend-api";
import { useTenant } from "@/features/tenants/tenant-context";

type ReconnectPrompt = {
  id: string;
  integration: string;
  module?: string | null;
  reason: string;
  action_url?: string | null;
};

type ClientHealthStatus = {
  integration: string;
  module?: string | null;
  status: string;
  severity: string;
  message: string;
  is_user_action_required?: boolean;
};

type OAuthStartResponse = {
  authorization_url: string;
  state: string;
};

const GOOGLE_RECONNECT_RETURN_KEY = "dashboard:googleReconnectReturnTo";

export function ClientReconnectBanner() {
  const { tenantId, supabase } = useTenant();
  const [prompts, setPrompts] = useState<ReconnectPrompt[]>([]);
  const [statuses, setStatuses] = useState<ClientHealthStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const [promptData, statusData] = await Promise.all([
          fetchBackendJson<{ rows: ReconnectPrompt[] }>(
            "/client/health/prompts",
            { query: { organization_id: tenantId } },
            supabase,
          ),
          fetchBackendJson<{ rows: ClientHealthStatus[] }>(
            "/client/integrations/status",
            { query: { organization_id: tenantId } },
            supabase,
          ).catch(() => ({ rows: [] })),
        ]);
        if (active) {
          setPrompts(promptData.rows ?? []);
          setStatuses(statusData.rows ?? []);
        }
      } catch {
        if (active) {
          setPrompts([]);
          setStatuses([]);
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [tenantId, supabase]);

  const googlePrompt = useMemo(
    () => prompts.find((prompt) => prompt.integration === "google_business_profile" || prompt.integration === "google"),
    [prompts],
  );
  const platformIssue = useMemo(
    () =>
      statuses.find(
        (status) =>
          !status.is_user_action_required &&
          status.status !== "healthy" &&
          ["critical", "warning"].includes(status.severity),
      ),
    [statuses],
  );

  const reconnectGoogle = useCallback(async () => {
    if (!tenantId) return;
    setStarting(true);
    setError(null);
    try {
      const redirectUri = `${window.location.origin}/onboarding/google/callback`;
      const response = await fetchBackendJson<OAuthStartResponse>(
        "/google/oauth/start",
        {
          method: "POST",
          body: JSON.stringify({
            organization_id: tenantId,
            redirect_uri: redirectUri,
            scopes: ["https://www.googleapis.com/auth/business.manage"],
          }),
        },
        supabase,
      );
      window.sessionStorage.setItem(GOOGLE_RECONNECT_RETURN_KEY, window.location.pathname || "/dashboard");
      window.location.href = response.authorization_url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to start Google reconnect");
    } finally {
      setStarting(false);
    }
  }, [tenantId, supabase]);

  if (loading || (!googlePrompt && !platformIssue)) return null;

  return (
    <Card className="border-amber-200 bg-amber-50">
      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex min-w-0 gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
          <div>
            <p className="font-semibold">{googlePrompt ? "Google Business Profile needs attention" : "Feature temporarily unavailable"}</p>
            {googlePrompt ? (
              <p className="text-sm text-muted-foreground">
                Your Google Business Profile connection needs to be reconnected. Some automations are paused until you reconnect.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                {platformIssue?.message || "This feature is temporarily unavailable. We've been notified and are working on it."}
              </p>
            )}
            {error && <p className="mt-1 text-sm text-amber-900">{error}</p>}
          </div>
        </div>
        {googlePrompt && (
          <Button onClick={reconnectGoogle} disabled={starting}>
            <ExternalLink className="mr-2 h-4 w-4" />
            {starting ? "Opening..." : "Reconnect Google Business Profile"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getAccessToken } from "@/lib/supabase/session";

const steps = [
  "Create org",
  "Connect Google",
  "Choose locations",
  "Configure automations",
  "Brand voice",
  "Finish",
];

const industries = ["Home Services", "Legal", "Healthcare", "Hospitality", "Other"];
const locationOptions = [
  { id: "loc-1", name: "Downtown HQ", address: "123 Main St" },
  { id: "loc-2", name: "Uptown Service", address: "88 Pine Ave" },
  { id: "loc-3", name: "Westside Warehouse", address: "42 Industrial Rd" },
];
const toneOptions = ["Friendly", "Professional", "Bold", "Concise"];
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export default function OnboardingPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [orgInfo, setOrgInfo] = useState({
    name: "",
    industry: industries[0],
    primaryLocation: "",
  });
  const [creatingOrg, setCreatingOrg] = useState(false);
  const [createOrgError, setCreateOrgError] = useState<string | null>(null);
  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [locationState, setLocationState] = useState(
    () =>
      locationOptions.reduce<Record<string, { selected: boolean; automation: boolean }>>((acc, loc, index) => {
        acc[loc.id] = { selected: index === 0, automation: true };
        return acc;
      }, {}),
  );
  const [automationConfig, setAutomationConfig] = useState({
    reviewAutoThreshold: 4,
    reviewApprovalThreshold: 3,
    qnaCadence: "1 Q&A / week",
    maxPostsPerWeek: 5,
  });
  const [brandVoice, setBrandVoice] = useState({
    tone: toneOptions[0],
    services: "HVAC install, furnace tune-ups",
    cities: "Downtown, Uptown",
    websiteText: "",
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const storedOrgId = sessionStorage.getItem("onboarding.orgId");
    if (storedOrgId) {
      setOrganizationId(storedOrgId);
    }
    const storedConnected = sessionStorage.getItem("onboarding.googleConnected");
    if (storedConnected === "true") {
      setGoogleConnected(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (organizationId) {
      sessionStorage.setItem("onboarding.orgId", organizationId);
    }
  }, [organizationId]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    sessionStorage.setItem("onboarding.googleConnected", googleConnected ? "true" : "false");
  }, [googleConnected]);

  useEffect(() => {
    const token = searchParams?.get("token");
    if (!token || organizationId) {
      return;
    }
    const exchangeToken = async () => {
      try {
        setTokenError(null);
        const response = await fetch(`${API_BASE_URL}/orgs/onboarding/token`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ token }),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.detail || "Invalid or expired onboarding link");
        }
        const data = await response.json();
        setOrganizationId(data.organization_id);
        setOrgInfo((prev) => ({
          ...prev,
          name: data.organization_name || prev.name,
        }));
      } catch (error) {
        setTokenError(error instanceof Error ? error.message : "Unable to redeem onboarding link");
      }
    };
    void exchangeToken();
  }, [organizationId, searchParams]);

  const completed = currentStep === steps.length - 1;
  const nextDisabled =
    (currentStep === 0 && !orgInfo.name.trim()) ||
    (currentStep === 1 && !googleConnected) ||
    (currentStep === 2 && !Object.values(locationState).some((item) => item.selected));

  const progress = useMemo(() => ((currentStep + 1) / steps.length) * 100, [currentStep]);
  const scheduledDate = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() + 2);
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }, []);

  const createOrganization = async () => {
    if (creatingOrg || organizationId) {
      return;
    }
    setCreatingOrg(true);
    setCreateOrgError(null);
    try {
      const token = await getAccessToken();
      if (!token) {
        throw new Error("Sign in to create your organization.");
      }
      const response = await fetch(`${API_BASE_URL}/orgs/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: orgInfo.name.trim(),
          org_type: "agency",
          slug: undefined,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.detail || "Unable to create organization");
      }
      const org = await response.json();
      setOrganizationId(org.id);
    } catch (error) {
      setCreateOrgError(error instanceof Error ? error.message : "Failed to create organization");
      throw error;
    } finally {
      setCreatingOrg(false);
    }
  };

  const handleConnectGoogle = async () => {
    if (!organizationId || connectingGoogle) {
      if (!organizationId) {
        setConnectError("Create the organization first.");
      }
      return;
    }
    setConnectError(null);
    setConnectingGoogle(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        throw new Error("Sign in to connect Google.");
      }
      const redirectUri = typeof window !== "undefined" ? `${window.location.origin}/onboarding/google/callback` : undefined;
      const response = await fetch(`${API_BASE_URL}/google/oauth/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          organization_id: organizationId,
          redirect_uri: redirectUri,
          scopes: ["https://www.googleapis.com/auth/business.manage"],
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.detail || "Unable to start Google OAuth");
      }
      const data = await response.json();
      if (typeof window !== "undefined") {
        sessionStorage.setItem("onboarding.pendingOAuthOrgId", organizationId);
        window.location.href = data.authorization_url;
      }
    } catch (error) {
      setConnectError(error instanceof Error ? error.message : "Failed to connect Google");
    } finally {
      setConnectingGoogle(false);
    }
  };

  const handleLocationSelection = (id: string, field: "selected" | "automation") => {
    setLocationState((prev) => ({
      ...prev,
      [id]: { ...prev[id], [field]: !prev[id][field] },
    }));
  };

  const handleSkipToDemoDashboard = () => {
    setGoogleConnected(true);
    setCurrentStep(steps.length - 1);
    if (typeof window !== "undefined") {
      sessionStorage.setItem("onboarding.googleConnected", "true");
      sessionStorage.setItem("onboarding.demoMode", "true");
    }
    router.push("/app");
  };

  const goNext = async () => {
    if (currentStep === 0 && !organizationId) {
      try {
        await createOrganization();
      } catch {
        return;
      }
    }
    if (currentStep < steps.length - 1) {
      setCurrentStep((step) => step + 1);
    }
  };

  const goBack = () => {
    if (currentStep > 0) {
      setCurrentStep((step) => step - 1);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 px-6 py-12">
      <div className="mx-auto max-w-3xl space-y-8">
        <header className="space-y-2 text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-primary">Onboarding</p>
          <h1 className="text-3xl font-semibold">Launch your automations</h1>
          <p className="text-sm text-slate-600">Finish the wizard so the dashboard is fully configured before day one.</p>
        </header>
        {tokenError && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {tokenError}
          </div>
        )}

        <div>
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            <span>
              Step {currentStep + 1} / {steps.length}
            </span>
            <span>{steps[currentStep]}</span>
          </div>
          <div className="mt-3 h-2 rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <section className="space-y-6 rounded-3xl bg-white p-6 shadow-sm">
          {currentStep === 0 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">Create organization</h2>
              <div className="space-y-3 text-sm">
                <label className="block">
                  <span className="text-slate-600">Company name</span>
                  <input
                    className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2"
                    placeholder="Acme HVAC"
                    value={orgInfo.name}
                    onChange={(event) => setOrgInfo((prev) => ({ ...prev, name: event.target.value }))}
                  />
                </label>
                <label className="block">
                  <span className="text-slate-600">Industry</span>
                  <select
                    className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2"
                    value={orgInfo.industry}
                    onChange={(event) => setOrgInfo((prev) => ({ ...prev, industry: event.target.value }))}
                  >
                    {industries.map((industry) => (
                      <option key={industry}>{industry}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-slate-600">Primary location (optional)</span>
                  <input
                    className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2"
                    placeholder="City, State"
                    value={orgInfo.primaryLocation}
                    onChange={(event) => setOrgInfo((prev) => ({ ...prev, primaryLocation: event.target.value }))}
                  />
                </label>
              </div>
              {createOrgError && <p className="text-sm text-rose-600">{createOrgError}</p>}
              {organizationId && (
                <p className="text-xs text-emerald-600">
                  Organization created. ID <span className="font-mono">{organizationId}</span>
                </p>
              )}
            </div>
          )}

          {currentStep === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold">Connect Google Business Profile</h2>
              <p className="text-sm text-slate-600">Authorize Map Pack 3 so we can read listings and post on your behalf.</p>
            </div>
            <button
              className="flex items-center justify-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
              onClick={handleConnectGoogle}
              disabled={googleConnected || connectingGoogle || !organizationId}
            >
              {googleConnected ? "Google Connected ✓" : connectingGoogle ? "Redirecting…" : "Connect Google"}
            </button>
            <button
              type="button"
              className="flex items-center justify-center gap-2 rounded-full border border-dashed border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-primary hover:text-primary"
              onClick={handleSkipToDemoDashboard}
            >
              Skip Google for now — open demo dashboard
            </button>
            {!organizationId && (
              <p className="text-xs text-amber-600">Create the organization first to unlock the Google connect button.</p>
            )}
            {googleConnected && (
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-600">
                  Success! We can now fetch your GBP locations.
                </div>
              )}
              {connectError && <p className="text-sm text-rose-600">{connectError}</p>}
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">Choose locations</h2>
              <p className="text-sm text-slate-600">Pick which GBP locations to automate. You can add more later.</p>
              <div className="space-y-3">
                {locationOptions.map((location) => {
                  const selection = locationState[location.id];
                  return (
                    <div key={location.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-100 p-4">
                      <div>
                        <p className="font-semibold">{location.name}</p>
                        <p className="text-sm text-slate-500">{location.address}</p>
                      </div>
                      <div className="flex items-center gap-3 text-sm">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={selection.selected}
                            onChange={() => handleLocationSelection(location.id, "selected")}
                          />
                          Enable location
                        </label>
                        <label className={`flex items-center gap-2 ${!selection.selected ? "text-slate-400" : ""}`}>
                          <input
                            type="checkbox"
                            checked={selection.automation}
                            disabled={!selection.selected}
                            onChange={() => handleLocationSelection(location.id, "automation")}
                          />
                          Enable automation
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {currentStep === 3 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">Configure automations</h2>
              <p className="text-sm text-slate-600">
                Our scheduler decides the posting cadence automatically; set guardrails for reviews and Q&A here.
              </p>
              <div className="space-y-3 text-sm">
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary">Posting cadence</p>
                  <p className="mt-2 text-sm text-slate-600">
                    Map Pack 3 balances freshness, performance, and inventory to choose the next publish time. We’ll stay within
                    your guardrails below.
                  </p>
                  <label className="mt-3 block text-xs">
                    <span className="text-slate-600">Max posts per week (optional)</span>
                    <input
                      type="number"
                      min={1}
                      max={14}
                      className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2"
                      value={automationConfig.maxPostsPerWeek}
                      onChange={(event) =>
                        setAutomationConfig((prev) => ({ ...prev, maxPostsPerWeek: Number(event.target.value) }))
                      }
                    />
                  </label>
                  <p className="mt-1 text-xs text-slate-500">Leave as-is to let the algorithm run fully autonomously.</p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block">
                    <span className="text-slate-600">Auto-reply reviews rated</span>
                    <input
                      type="number"
                      min={1}
                      max={5}
                      className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2"
                      value={automationConfig.reviewAutoThreshold}
                      onChange={(event) =>
                        setAutomationConfig((prev) => ({ ...prev, reviewAutoThreshold: Number(event.target.value) }))
                      }
                    />
                  </label>
                  <label className="block">
                    <span className="text-slate-600">Require approval when rating ≤</span>
                    <input
                      type="number"
                      min={1}
                      max={5}
                      className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2"
                      value={automationConfig.reviewApprovalThreshold}
                      onChange={(event) =>
                        setAutomationConfig((prev) => ({ ...prev, reviewApprovalThreshold: Number(event.target.value) }))
                      }
                    />
                  </label>
                </div>
                <label className="block">
                  <span className="text-slate-600">Q&A cadence</span>
                  <select
                    className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2"
                    value={automationConfig.qnaCadence}
                    onChange={(event) => setAutomationConfig((prev) => ({ ...prev, qnaCadence: event.target.value }))}
                  >
                    {["1 Q&A / week", "2 Q&A / week"].map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          )}

          {currentStep === 4 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">Brand voice</h2>
              <p className="text-sm text-slate-600">We use this to seed AI-generated captions, replies, and Q&A.</p>
              <div className="space-y-3 text-sm">
                <label className="block">
                  <span className="text-slate-600">Tone</span>
                  <select
                    className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2"
                    value={brandVoice.tone}
                    onChange={(event) => setBrandVoice((prev) => ({ ...prev, tone: event.target.value }))}
                  >
                    {toneOptions.map((tone) => (
                      <option key={tone}>{tone}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-slate-600">Services</span>
                  <input
                    className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2"
                    value={brandVoice.services}
                    onChange={(event) => setBrandVoice((prev) => ({ ...prev, services: event.target.value }))}
                  />
                </label>
                <label className="block">
                  <span className="text-slate-600">Cities / Areas</span>
                  <input
                    className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2"
                    value={brandVoice.cities}
                    onChange={(event) => setBrandVoice((prev) => ({ ...prev, cities: event.target.value }))}
                  />
                </label>
                <label className="block">
                  <span className="text-slate-600">Optional: Paste website copy</span>
                  <textarea
                    className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2"
                    rows={3}
                    placeholder="Paste your about copy or service descriptions"
                    value={brandVoice.websiteText}
                    onChange={(event) => setBrandVoice((prev) => ({ ...prev, websiteText: event.target.value }))}
                  />
                </label>
                <div className="rounded-2xl bg-slate-50 p-4 text-sm">
                  <p className="text-xs font-semibold text-slate-500">Preview</p>
                  <p className="text-slate-700">
                    {brandVoice.tone} tone with services {brandVoice.services || "—"} in {brandVoice.cities || "—"}.
                  </p>
                </div>
              </div>
            </div>
          )}

          {currentStep === 5 && (
            <div className="space-y-4 text-center">
              <h2 className="text-2xl font-semibold">All set!</h2>
              <p className="text-sm text-slate-600">Your next automated post is scheduled for {scheduledDate}.</p>
              <div className="rounded-3xl border border-slate-100 bg-slate-50 p-6">
                <p className="text-lg font-semibold">Invite teammates</p>
                <p className="text-sm text-slate-600">Bring owners or admins into the dashboard to share approvals.</p>
                <button className="mt-4 rounded-full border border-primary px-4 py-2 text-sm font-semibold text-primary">
                  Copy invite link
                </button>
              </div>
              <a href="/app" className="inline-block rounded-full bg-primary px-6 py-3 text-sm font-semibold text-white">
                Go to dashboard
              </a>
            </div>
          )}
        </section>

        <div className="flex justify-between">
          <button
            className="rounded-full border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-600 disabled:opacity-50"
            onClick={goBack}
            disabled={currentStep === 0}
          >
            Back
          </button>
          {!completed && (
            <button
              className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
              onClick={() => {
                void goNext();
              }}
              disabled={nextDisabled || creatingOrg}
            >
              {creatingOrg && currentStep === 0 ? "Creating…" : "Continue"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

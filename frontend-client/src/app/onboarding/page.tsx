"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { useRouter, useSearchParams } from "next/navigation";
import { googleBusinessCategories, defaultIndustry } from "@/data/googleBusinessCategories";
import { createClient } from "@/lib/supabase/client";
import { getAccessToken } from "@/lib/supabase/session";

const steps = ["Create account", "Business setup", "Stripe signup", "Connect Google", "Finish"];

const defaultLocationOptions = [
  { id: "loc-1", name: "Downtown HQ", address: "123 Main St" },
  { id: "loc-2", name: "Uptown Service", address: "88 Pine Ave" },
  { id: "loc-3", name: "Westside Warehouse", address: "42 Industrial Rd" },
];
const toneOptions = ["Friendly", "Professional", "Bold", "Concise"];
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "");
type StripeSubmitHandle = { submit: () => Promise<boolean> };

type StripePaymentProps = {
  onPaid: () => void;
  setError: (message: string | null) => void;
  setSubmitting: (value: boolean) => void;
  submitting: boolean;
};

const StripePaymentSection = forwardRef<StripeSubmitHandle, StripePaymentProps>(function StripePaymentSection(
  { onPaid, setError, setSubmitting, submitting },
  ref,
) {
  const stripe = useStripe();
  const elements = useElements();

  useImperativeHandle(ref, () => ({
    submit: async () => {
      if (!stripe || !elements) {
        setError("Payment form not ready yet. Please wait a moment.");
        return false;
      }
      setSubmitting(true);
      setError(null);
      try {
        const result = await stripe.confirmPayment({
          elements,
          redirect: "if_required",
        });
        if (result.error) {
          setError(result.error.message ?? "Payment failed");
          return false;
        }
        onPaid();
        return true;
      } finally {
        setSubmitting(false);
      }
    },
  }));

  return (
    <div className="space-y-4">
      <PaymentElement options={{ layout: "tabs" }} />
      {submitting && <p className="text-xs text-slate-500">Processing payment…</p>}
    </div>
  );
});

export default function OnboardingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [hasSession, setHasSession] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [currentStep, setCurrentStep] = useState(0);
  const [industrySearch, setIndustrySearch] = useState("");
  const [savingProgress, setSavingProgress] = useState(false);
  const [progressError, setProgressError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [stripeStarted, setStripeStarted] = useState(false);
  const [stripeClientSecret, setStripeClientSecret] = useState<string | null>(null);
  const [stripeSubscriptionId, setStripeSubscriptionId] = useState<string | null>(null);
  const [stripeLoading, setStripeLoading] = useState(false);
  const [stripeError, setStripeError] = useState<string | null>(null);
  const [stripeSubmitting, setStripeSubmitting] = useState(false);
  const stripeSectionRef = useRef<StripeSubmitHandle>(null);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [orgInfo, setOrgInfo] = useState({
    name: "",
    firstName: "",
    lastName: "",
    industry: defaultIndustry,
    primaryLocation: "",
    secondaryLocations: ["", "", ""],
  });
  const [creatingOrg, setCreatingOrg] = useState(false);
  const [createOrgError, setCreateOrgError] = useState<string | null>(null);
  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [locationState, setLocationState] = useState<Record<string, { selected: boolean; automation: boolean }>>({});
  const [brandVoice, setBrandVoice] = useState({
    tone: toneOptions[0],
    services: "HVAC install, furnace tune-ups",
    cities: "Downtown, Uptown",
    websiteText: "",
  });

  const filteredIndustries = useMemo(() => {
    const query = industrySearch.trim().toLowerCase();
    if (!query) {
      return googleBusinessCategories;
    }
    return googleBusinessCategories.filter((industry) => industry.toLowerCase().includes(query));
  }, [industrySearch]);

  const industryOptions = useMemo(() => {
    if (filteredIndustries.includes(orgInfo.industry)) {
      return filteredIndustries;
    }
    return [orgInfo.industry, ...filteredIndustries];
  }, [filteredIndustries, orgInfo.industry]);

  const locationOptions = useMemo(() => {
    const entries: { id: string; name: string; address: string }[] = [];
    const primary = orgInfo.primaryLocation.trim();
    if (primary) {
      entries.push({ id: "primary-location", name: primary, address: primary });
    }
    orgInfo.secondaryLocations.forEach((value, index) => {
      const trimmed = value.trim();
      if (trimmed) {
        entries.push({ id: `secondary-${index + 1}`, name: trimmed, address: trimmed });
      }
    });
    if (!entries.length) {
      return defaultLocationOptions;
    }
    return entries;
  }, [orgInfo.primaryLocation, orgInfo.secondaryLocations]);

  useEffect(() => {
    let active = true;
    const checkSession = async () => {
      try {
        const token = await getAccessToken();
        if (!active) return;
        setHasSession(Boolean(token));
      } finally {
        if (active) {
          setCheckingSession(false);
        }
      }
    };
    void checkSession();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setLocationState((prev) => {
      const next: Record<string, { selected: boolean; automation: boolean }> = {};
      locationOptions.forEach((loc, index) => {
        next[loc.id] = prev[loc.id] ?? { selected: index === 0, automation: true };
      });
      return next;
    });
  }, [locationOptions]);

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
    const storedStripe = sessionStorage.getItem("onboarding.stripeStarted");
    if (storedStripe === "true") {
      setStripeStarted(true);
    }
  }, []);

  useEffect(() => {
    const supabase = createClient();
    void supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? null);
    });
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
    if (typeof window === "undefined") {
      return;
    }
    sessionStorage.setItem("onboarding.stripeStarted", stripeStarted ? "true" : "false");
  }, [stripeStarted]);

  useEffect(() => {
    if (currentStep === 2 && !stripeClientSecret && !stripeLoading) {
      void initializeStripeIntent();
    }
  }, [currentStep, stripeClientSecret, stripeLoading, orgInfo.name, userEmail]);

  useEffect(() => {
    const token = searchParams?.get("token");
    const run = async () => {
      try {
        setTokenError(null);
        // First, if token-based flow exists, redeem it.
        if (token && !organizationId) {
          const response = await fetch(`${API_BASE_URL}/orgs/onboarding/token`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token }),
          });
          if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            throw new Error(payload.detail || "Invalid or expired onboarding link");
          }
          const data = await response.json();
          setOrganizationId(data.organization_id);
          setOrgInfo((prev) => ({ ...prev, name: data.organization_name || prev.name }));
        }

        // Then claim any pending onboarding row by email (Supabase session required)
        const claimRes = await fetch("/api/onboarding/claim", { method: "POST" });
        if (claimRes.ok) {
          const claim = await claimRes.json();
          setOrganizationId((prev) => prev ?? claim.tenant_id);
          setOrgInfo((prev) => ({ ...prev, name: claim.business_name || prev.name }));
        }
      } catch (error) {
        setTokenError(error instanceof Error ? error.message : "Unable to redeem onboarding link");
      }
    };
    void run();
  }, [organizationId, searchParams]);

  const completed = currentStep === steps.length - 1;
  const nextDisabled = useMemo(() => {
    if (currentStep === 0) {
      return checkingSession || !hasSession;
    }
    if (currentStep === 1) {
      return !orgInfo.name.trim() || !Object.values(locationState).some((item) => item.selected);
    }
    if (currentStep === 2) {
      return !stripeStarted;
    }
    if (currentStep === 3) {
      return !googleConnected;
    }
    return false;
  }, [checkingSession, currentStep, googleConnected, hasSession, locationState, orgInfo.name, stripeStarted]);

  const progress = useMemo(() => ((currentStep + 1) / steps.length) * 100, [currentStep]);
  const scheduledDate = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() + 2);
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }, []);

  type SavePayload = {
    business_name?: string;
    first_name?: string;
    last_name?: string;
    status?: string;
  };

  const saveProgress = async (payload: SavePayload) => {
    if (!hasSession) {
      throw new Error("Sign in to continue.");
    }
    setSavingProgress(true);
    setProgressError(null);
    try {
      const res = await fetch("/api/onboarding/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to save progress");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save progress";
      setProgressError(message);
      throw error;
    } finally {
      setSavingProgress(false);
    }
  };

  const initializeStripeIntent = async () => {
    if (!userEmail) {
      setStripeError("Sign in to continue.");
      return;
    }
    setStripeLoading(true);
    setStripeError(null);
    setStripeClientSecret(null);
    setStripeStarted(false);
    try {
      const response = await fetch(`${API_BASE_URL}/billing/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: userEmail,
          company_name: orgInfo.name.trim() || "New client",
          plan: "starter",
        }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Unable to start Stripe checkout");
      }
      const payload = await response.json();
      setStripeClientSecret(payload.client_secret);
      setStripeSubscriptionId(payload.subscription_id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to start Stripe checkout";
      setStripeError(message);
    } finally {
      setStripeLoading(false);
    }
  };

  const refreshSession = async () => {
    setCheckingSession(true);
    const token = await getAccessToken();
    setHasSession(Boolean(token));
    setCheckingSession(false);
  };

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
    setLocationState((prev) => {
      const current = prev[id] ?? { selected: false, automation: true };
      return {
        ...prev,
        [id]: { ...current, [field]: !current[field] },
      };
    });
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

  const handleStartStripe = () => {
    void initializeStripeIntent();
  };

  const statusForStep = (step: number) => {
    switch (step) {
      case 1:
        return "business_setup";
      case 2:
        return stripeStarted ? "stripe_started" : "stripe_pending";
      case 3:
        return googleConnected ? "google_connected" : "google_skipped";
      default:
        return "in_progress";
    }
  };

  const goNext = async () => {
    if (currentStep === 1 && !organizationId) {
      try {
        await createOrganization();
      } catch {
        return;
      }
    }

    try {
      if (currentStep === 1) {
        await saveProgress({
          business_name: orgInfo.name.trim(),
          first_name: orgInfo.firstName.trim(),
          last_name: orgInfo.lastName.trim(),
          status: statusForStep(currentStep),
        });
      } else if (currentStep > 1 && currentStep < steps.length) {
        await saveProgress({ status: statusForStep(currentStep) });
      }
    } catch {
      return;
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

  // Restore step and orgId from sessionStorage if returning mid-flow
  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedStep = sessionStorage.getItem("onboarding.step");
    if (storedStep) {
      const stepNum = Number(storedStep);
      if (!Number.isNaN(stepNum) && stepNum >= 0 && stepNum < steps.length) {
        setCurrentStep(stepNum);
      }
    }
    const storedOrgId = sessionStorage.getItem("onboarding.orgId");
    if (storedOrgId) {
      setOrganizationId(storedOrgId);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    sessionStorage.setItem("onboarding.step", String(currentStep));
  }, [currentStep]);

  const handleContinue = async () => {
    if (currentStep === 2) {
      const ok = await stripeSectionRef.current?.submit();
      if (!ok) {
        return;
      }
    }
    await goNext();
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
              <h2 className="text-xl font-semibold">Create your account</h2>
              <p className="text-sm text-slate-600">
                Sign up or sign in first. We’ll bring you back here and use the same session to create your organization.
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white"
                  onClick={() => router.push("/sign-up?redirect=/onboarding")}
                >
                  Create account
                </button>
                <button
                  className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
                  onClick={() => router.push("/sign-in?redirect=/onboarding")}
                >
                  Sign in
                </button>
                <button
                  className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-60"
                  onClick={() => {
                    void refreshSession();
                  }}
                  disabled={checkingSession}
                >
                  {checkingSession ? "Checking session…" : "Refresh status"}
                </button>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <span className={`h-2 w-2 rounded-full ${hasSession ? "bg-emerald-500" : "bg-amber-500"}`} />
                <span>
                  {checkingSession
                    ? "Looking for an active session..."
                    : hasSession
                      ? "Session found. Continue to the next step."
                      : "No session detected yet. Sign in to proceed."}
                </span>
              </div>
            </div>
          )}

          {currentStep === 1 && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold">Business setup</h2>
              <div className="space-y-5 text-sm">
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="block">
                    <span className="text-slate-600">Your first name</span>
                    <input
                      className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2"
                      placeholder="Alex"
                      value={orgInfo.firstName}
                      onChange={(event) => setOrgInfo((prev) => ({ ...prev, firstName: event.target.value }))}
                    />
                  </label>
                  <label className="block">
                    <span className="text-slate-600">Your last name</span>
                    <input
                      className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2"
                      placeholder="Reyes"
                      value={orgInfo.lastName}
                      onChange={(event) => setOrgInfo((prev) => ({ ...prev, lastName: event.target.value }))}
                    />
                  </label>
                </div>
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
                  <span className="text-slate-600">Search industries</span>
                  <input
                    className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2"
                    placeholder="Type to filter Google Business Profile categories"
                    value={industrySearch}
                    onChange={(event) => setIndustrySearch(event.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="text-slate-600">Industry</span>
                  <select
                    className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2"
                    value={orgInfo.industry}
                    onChange={(event) => setOrgInfo((prev) => ({ ...prev, industry: event.target.value }))}
                  >
                    {industryOptions.map((industry) => (
                      <option key={industry}>{industry}</option>
                    ))}
                  </select>
                  {filteredIndustries.length === 0 && (
                    <p className="mt-1 text-xs text-amber-600">No matches found. Try a different keyword.</p>
                  )}
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
                <div>
                  <span className="text-slate-600">Secondary locations (up to 3)</span>
                  <div className="mt-2 space-y-2">
                    {orgInfo.secondaryLocations.map((value, index) => (
                      <input
                        key={`secondary-${index}`}
                        className="w-full rounded-2xl border border-slate-200 px-3 py-2"
                        placeholder={`Secondary location ${index + 1}`}
                        value={value}
                        onChange={(event) =>
                          setOrgInfo((prev) => {
                            const next = [...prev.secondaryLocations];
                            next[index] = event.target.value;
                            return { ...prev, secondaryLocations: next };
                          })
                        }
                      />
                    ))}
                  </div>
                </div>
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-slate-800">Select locations to automate</p>
                  <div className="space-y-3">
                    {locationOptions.map((location) => {
                      const selection = locationState[location.id] ?? { selected: false, automation: true };
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
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-slate-800">Brand voice</p>
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
              {createOrgError && <p className="text-sm text-rose-600">{createOrgError}</p>}
              {organizationId && (
                <p className="text-xs text-emerald-600">
                  Organization created. ID <span className="font-mono">{organizationId}</span>
                </p>
              )}
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">Sign up for Stripe</h2>
              <p className="text-sm text-slate-600">Pay securely without leaving onboarding. We’ll advance as soon as payment succeeds.</p>
              {stripeError && <p className="text-sm text-rose-600">{stripeError}</p>}
              {!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ? (
                <p className="text-sm text-amber-600">Stripe publishable key missing. Add NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY to continue.</p>
              ) : stripeLoading && !stripeClientSecret ? (
                <p className="text-sm text-slate-600">Preparing payment form…</p>
              ) : stripeClientSecret ? (
                <Elements stripe={stripePromise} options={{ clientSecret: stripeClientSecret }}>
                  <StripePaymentSection
                    ref={stripeSectionRef}
                    onPaid={() => {
                      setStripeStarted(true);
                      if (typeof window !== "undefined") {
                        sessionStorage.setItem("onboarding.stripeStarted", "true");
                      }
                    }}
                    setError={setStripeError}
                    setSubmitting={setStripeSubmitting}
                    submitting={stripeSubmitting}
                  />
                </Elements>
              ) : (
                <p className="text-sm text-amber-600">Add business info first, then refresh the payment form.</p>
              )}
              <div className="flex flex-wrap gap-3">
                <button
                  className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
                  type="button"
                  onClick={handleStartStripe}
                  disabled={stripeLoading}
                >
                  {stripeLoading ? "Refreshing…" : "Refresh payment form"}
                </button>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <span className={`h-2 w-2 rounded-full ${stripeStarted ? "bg-emerald-500" : "bg-amber-500"}`} />
                <span>{stripeStarted ? "Payment successful" : "Awaiting payment"}</span>
              </div>
            </div>
          )}

          {currentStep === 3 && (
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

          {currentStep === 4 && (
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

        {progressError && <p className="text-sm text-rose-600">{progressError}</p>}

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
                void handleContinue();
              }}
              disabled={
                nextDisabled ||
                creatingOrg ||
                savingProgress ||
                (currentStep === 2 && (stripeLoading || stripeSubmitting || !stripeClientSecret))
              }
            >
              {currentStep === 2
                ? stripeSubmitting
                  ? "Processing…"
                  : "Pay & continue"
                : savingProgress
                  ? "Saving…"
                  : creatingOrg && currentStep === 1
                    ? "Creating…"
                    : "Continue"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

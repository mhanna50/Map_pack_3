"use client";

import { forwardRef, Suspense, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getAccessToken } from "@/lib/supabase/session";

const steps = ["Create account", "Business setup", "Stripe signup", "Connect Google", "Finish"];

const toneOptions = ["Friendly", "Professional", "Bold", "Concise"];
const toneSentenceSamples: Record<string, string> = {
  Friendly: "Hey neighbors, we just finished another same-day AC repair and we are here if your system needs help.",
  Professional: "Our team provides licensed HVAC maintenance with clear diagnostics and scheduled follow-up service.",
  Bold: "Stop settling for weak airflow - our technicians fix root causes fast and keep your home comfortable.",
  Concise: "Fast HVAC repair, clear pricing, and reliable results.",
};
const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000").trim().replace(/\/+$/, "");
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "");
const ONBOARDING_DRAFT_KEY = "onboarding:draft:v1";
const ONBOARDING_STEP_KEY = "onboarding:step:v1";
const ONBOARDING_ORG_ID_KEY = "onboarding:orgId:v1";
const ONBOARDING_GOOGLE_CONNECTED_KEY = "onboarding:googleConnected:v1";
const ONBOARDING_STRIPE_STARTED_KEY = "onboarding:stripeStarted:v1";
const DEFAULT_LIST_ROWS = 3;
const MAX_SECONDARY_LOCATIONS = 10;
const MAX_SERVICE_ROWS = 10;

const ONBOARDING_STATUS_RANK: Record<string, number> = {
  in_progress: 0,
  business_setup: 1,
  stripe_pending: 2,
  stripe_started: 3,
  google_pending: 4,
  google_connected: 5,
  completed: 6,
  activated: 6,
  canceled: -1,
};

const buildScopedKey = (baseKey: string, scope: string) => `${baseKey}:${scope}`;
type StripeSubmitHandle = { submit: () => Promise<boolean> };
type LocationInput = {
  city: string;
  state: string;
};
type OrgInfoState = {
  name: string;
  firstName: string;
  lastName: string;
  primaryLocationCity: string;
  primaryLocationState: string;
  secondaryLocations: LocationInput[];
};
type BrandVoiceState = {
  tone: string;
  services: string[];
  websiteText: string;
};
type OnboardingDraftState = {
  organizationId?: string;
  orgInfo?: Partial<OrgInfoState>;
  brandVoice?: Partial<BrandVoiceState>;
  googleConnected?: boolean;
  stripeStarted?: boolean;
  agreementAccepted?: boolean;
  agreementSignature?: string;
  passwordSetAt?: string | null;
};

const defaultOrgInfo: OrgInfoState = {
  name: "",
  firstName: "",
  lastName: "",
  primaryLocationCity: "",
  primaryLocationState: "",
  secondaryLocations: Array.from({ length: DEFAULT_LIST_ROWS }, () => ({ city: "", state: "" })),
};

const defaultBrandVoice: BrandVoiceState = {
  tone: toneOptions[0],
  services: Array.from({ length: DEFAULT_LIST_ROWS }, () => ""),
  websiteText: "",
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const emptyLocationInput = (): LocationInput => ({ city: "", state: "" });

const parseLocationText = (value: string): LocationInput => {
  const raw = value.trim();
  if (!raw) {
    return emptyLocationInput();
  }
  const [cityPart, ...stateParts] = raw.split(",");
  if (!stateParts.length) {
    return { city: cityPart.trim(), state: "" };
  }
  return { city: cityPart.trim(), state: stateParts.join(",").trim() };
};

const normalizeSecondaryLocations = (value: unknown): LocationInput[] => {
  if (!Array.isArray(value)) {
    return Array.from({ length: DEFAULT_LIST_ROWS }, () => emptyLocationInput());
  }
  const normalized = value
    .slice(0, MAX_SECONDARY_LOCATIONS)
    .map((item) => {
      if (typeof item === "string") {
        return parseLocationText(item);
      }
      if (isRecord(item)) {
        return {
          city: typeof item.city === "string" ? item.city : "",
          state: typeof item.state === "string" ? item.state : "",
        };
      }
      return emptyLocationInput();
    });
  while (normalized.length < DEFAULT_LIST_ROWS) {
    normalized.push(emptyLocationInput());
  }
  return normalized;
};

const normalizeServiceList = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    const normalized = value
      .slice(0, MAX_SERVICE_ROWS)
      .map((item) => (typeof item === "string" ? item : ""));
    while (normalized.length < DEFAULT_LIST_ROWS) {
      normalized.push("");
    }
    return normalized;
  }
  if (typeof value === "string") {
    const split = value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, MAX_SERVICE_ROWS);
    while (split.length < DEFAULT_LIST_ROWS) {
      split.push("");
    }
    return split;
  }
  return Array.from({ length: DEFAULT_LIST_ROWS }, () => "");
};

const statusToStep = (status?: string | null) => {
  switch (status) {
    case "completed":
    case "activated":
      return 4;
    case "google_connected":
    case "google_pending":
      return 3;
    case "stripe_started":
    case "stripe_pending":
      return 2;
    case "business_setup":
      return 1;
    default:
      return 0;
  }
};

const normalizeClientError = (error: unknown, fallback: string) => {
  const message = error instanceof Error ? error.message : fallback;
  const trimmed = message?.trim() || fallback;
  const lowered = trimmed.toLowerCase();

  if (trimmed === "[object Object]") {
    return fallback;
  }
  if (lowered.includes("the string did not match the expected pattern")) {
    return "Request URL is invalid. Check NEXT_PUBLIC_API_BASE_URL and restart frontend-client.";
  }
  if (lowered.includes("unexpected token '<'")) {
    return "Session expired or redirected to sign-in. Refresh and sign in again.";
  }
  if (lowered.includes("failed to fetch") || lowered.includes("networkerror")) {
    return "Unable to reach the API. Verify backend is running and NEXT_PUBLIC_API_BASE_URL is correct.";
  }
  return trimmed;
};

const extractValidationMessage = (item: unknown) => {
  if (typeof item === "string") return item;
  if (item && typeof item === "object" && "msg" in item) {
    const msg = (item as { msg?: unknown }).msg;
    if (typeof msg === "string") return msg;
  }
  return "";
};

const readErrorMessage = async (response: Response, fallback: string) => {
  const body = await response.text();
  if (!body) return fallback;

  try {
    const payload = JSON.parse(body) as { detail?: unknown; error?: unknown; message?: unknown };
    const detail = payload.detail ?? payload.error ?? payload.message;

    if (typeof detail === "string" && detail.trim()) {
      return detail.trim();
    }
    if (Array.isArray(detail)) {
      const combined = detail.map(extractValidationMessage).filter(Boolean).join("; ");
      if (combined) return combined;
    }
  } catch {
    const lowered = body.trim().toLowerCase();
    if (lowered.startsWith("<!doctype") || lowered.startsWith("<html")) {
      return "Session expired or redirected to sign-in. Refresh and sign in again.";
    }
  }

  return body.length <= 300 ? body : fallback;
};

type StripePaymentProps = {
  onPaid: () => void;
  setError: (message: string | null) => void;
  setSubmitting: (value: boolean) => void;
  submitting: boolean;
  showValidationCue: boolean;
  onValidationIssue: () => void;
};

const StripePaymentSection = forwardRef<StripeSubmitHandle, StripePaymentProps>(function StripePaymentSection(
  { onPaid, setError, setSubmitting, submitting, showValidationCue, onValidationIssue },
  ref,
) {
  const stripe = useStripe();
  const elements = useElements();

  useImperativeHandle(ref, () => ({
    submit: async () => {
      if (!stripe || !elements) {
        setError("Payment form not ready yet. Please wait a moment.");
        onValidationIssue();
        return false;
      }
      setSubmitting(true);
      setError(null);
      try {
        const submitResult = await elements.submit();
        if (submitResult.error) {
          setError(submitResult.error.message ?? "Please complete all required payment fields.");
          onValidationIssue();
          return false;
        }

        const result = await stripe.confirmPayment({
          elements,
          redirect: "if_required",
        });
        if (result.error) {
          setError(result.error.message ?? "Payment failed");
          onValidationIssue();
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
    <div
      className={`space-y-4 rounded-2xl border p-4 transition ${
        showValidationCue ? "border-rose-300 bg-rose-50/40" : "border-slate-200"
      }`}
    >
      <PaymentElement options={{ layout: "tabs" }} />
      {showValidationCue && (
        <p className="text-xs text-rose-700">
          Complete all required billing fields before continuing.
        </p>
      )}
      {submitting && <p className="text-xs text-slate-500">Processing payment…</p>}
    </div>
  );
});

export default function OnboardingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen px-6 py-12 text-center text-slate-600">Loading onboarding…</div>}>
      <OnboardingContent />
    </Suspense>
  );
}

function OnboardingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteEmailFromQuery = (searchParams?.get("invite_email") ?? searchParams?.get("email") ?? "").trim().toLowerCase() || null;
  const [hasSession, setHasSession] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [currentStep, setCurrentStep] = useState(0);
  const [onboardingStatus, setOnboardingStatus] = useState("in_progress");
  const [savingProgress, setSavingProgress] = useState(false);
  const [progressError, setProgressError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userStorageScope, setUserStorageScope] = useState<string | null>(null);
  const [resolvedInviteEmail, setResolvedInviteEmail] = useState<string | null>(inviteEmailFromQuery);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [settingPassword, setSettingPassword] = useState(false);
  const [passwordSetAt, setPasswordSetAt] = useState<string | null>(null);
  const [stripeStarted, setStripeStarted] = useState(false);
  const [stripeClientSecret, setStripeClientSecret] = useState<string | null>(null);
  const [stripeLoading, setStripeLoading] = useState(false);
  const [stripeError, setStripeError] = useState<string | null>(null);
  const [stripeSubmitting, setStripeSubmitting] = useState(false);
  const [stripeFieldAttention, setStripeFieldAttention] = useState(false);
  const stripeSectionRef = useRef<StripeSubmitHandle>(null);
  const stripeInitAttemptedRef = useRef(false);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const [agreementSignature, setAgreementSignature] = useState("");
  const [agreementError, setAgreementError] = useState<string | null>(null);
  const [finalizingOnboarding, setFinalizingOnboarding] = useState(false);
  const [loadingClaimStatus, setLoadingClaimStatus] = useState(true);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [orgInfo, setOrgInfo] = useState<OrgInfoState>(defaultOrgInfo);
  const [creatingOrg, setCreatingOrg] = useState(false);
  const [createOrgError, setCreateOrgError] = useState<string | null>(null);
  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [brandVoice, setBrandVoice] = useState<BrandVoiceState>(defaultBrandVoice);
  const inviteToken = searchParams?.get("token") ?? null;

  const buildOnboardingDraft = useCallback(
    (overrides?: { stripeStarted?: boolean; googleConnected?: boolean }): OnboardingDraftState => ({
      organizationId: organizationId ?? undefined,
      orgInfo,
      brandVoice,
      googleConnected: overrides?.googleConnected ?? googleConnected,
      stripeStarted: overrides?.stripeStarted ?? stripeStarted,
      agreementAccepted,
      agreementSignature,
      passwordSetAt,
    }),
    [
      agreementAccepted,
      agreementSignature,
      brandVoice,
      googleConnected,
      orgInfo,
      organizationId,
      passwordSetAt,
      stripeStarted,
    ],
  );

  const applyOnboardingDraft = useCallback((rawDraft: unknown) => {
    if (!isRecord(rawDraft)) {
      return;
    }
    const orgInfoDraft = isRecord(rawDraft.orgInfo) ? rawDraft.orgInfo : null;
    const brandVoiceDraft = isRecord(rawDraft.brandVoice) ? rawDraft.brandVoice : null;

    if (typeof rawDraft.organizationId === "string" && rawDraft.organizationId.trim()) {
      setOrganizationId(rawDraft.organizationId.trim());
    }
    if (orgInfoDraft) {
      const normalizedPrimary = (() => {
        const city = typeof orgInfoDraft.primaryLocationCity === "string" ? orgInfoDraft.primaryLocationCity : null;
        const state = typeof orgInfoDraft.primaryLocationState === "string" ? orgInfoDraft.primaryLocationState : null;
        if (city !== null || state !== null) {
          return { city: city ?? "", state: state ?? "" };
        }
        if (typeof orgInfoDraft.primaryLocation === "string") {
          return parseLocationText(orgInfoDraft.primaryLocation);
        }
        return null;
      })();
      setOrgInfo((prev) => ({
        ...prev,
        name: typeof orgInfoDraft.name === "string" ? orgInfoDraft.name : prev.name,
        firstName: typeof orgInfoDraft.firstName === "string" ? orgInfoDraft.firstName : prev.firstName,
        lastName: typeof orgInfoDraft.lastName === "string" ? orgInfoDraft.lastName : prev.lastName,
        primaryLocationCity: normalizedPrimary ? normalizedPrimary.city : prev.primaryLocationCity,
        primaryLocationState: normalizedPrimary ? normalizedPrimary.state : prev.primaryLocationState,
        secondaryLocations:
          orgInfoDraft.secondaryLocations !== undefined
            ? normalizeSecondaryLocations(orgInfoDraft.secondaryLocations)
            : prev.secondaryLocations,
      }));
    }
    if (brandVoiceDraft) {
      setBrandVoice((prev) => ({
        ...prev,
        tone: typeof brandVoiceDraft.tone === "string" ? brandVoiceDraft.tone : prev.tone,
        services:
          brandVoiceDraft.services !== undefined
            ? normalizeServiceList(brandVoiceDraft.services)
            : prev.services,
        websiteText: typeof brandVoiceDraft.websiteText === "string" ? brandVoiceDraft.websiteText : prev.websiteText,
      }));
    }
    if (typeof rawDraft.googleConnected === "boolean") {
      setGoogleConnected(rawDraft.googleConnected);
    }
    if (typeof rawDraft.stripeStarted === "boolean") {
      setStripeStarted(rawDraft.stripeStarted);
      if (rawDraft.stripeStarted) {
        setStripeClientSecret(null);
      }
    }
    if (typeof rawDraft.agreementAccepted === "boolean") {
      setAgreementAccepted(rawDraft.agreementAccepted);
    }
    if (typeof rawDraft.agreementSignature === "string") {
      setAgreementSignature(rawDraft.agreementSignature);
    }
    if (typeof rawDraft.passwordSetAt === "string" && rawDraft.passwordSetAt.trim()) {
      setPasswordSetAt(rawDraft.passwordSetAt);
    }
  }, []);

  useEffect(() => {
    if (inviteEmailFromQuery) {
      setResolvedInviteEmail(inviteEmailFromQuery);
    }
  }, [inviteEmailFromQuery]);

  useEffect(() => {
    let active = true;
    const checkSession = async () => {
      try {
        const token = await getAccessToken();
        if (!active) return;
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        const user = data.user;
        setHasSession(Boolean(token && user?.id));
        setUserEmail(user?.email ?? null);
        setUserStorageScope(user?.id ?? null);
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
    if (typeof window === "undefined" || !userStorageScope) {
      return;
    }
    const storedStep =
      localStorage.getItem(buildScopedKey(ONBOARDING_STEP_KEY, userStorageScope)) ??
      sessionStorage.getItem(buildScopedKey(ONBOARDING_STEP_KEY, userStorageScope));
    if (storedStep) {
      const stepNum = Number(storedStep);
      if (!Number.isNaN(stepNum) && stepNum >= 0 && stepNum < steps.length) {
        setCurrentStep(stepNum);
      }
    }

    const draftRaw = localStorage.getItem(buildScopedKey(ONBOARDING_DRAFT_KEY, userStorageScope));
    if (draftRaw) {
      try {
        const draft = JSON.parse(draftRaw) as unknown;
        applyOnboardingDraft(draft);
      } catch {
        // ignore malformed local draft
      }
    }

    const storedOrgId = sessionStorage.getItem(buildScopedKey(ONBOARDING_ORG_ID_KEY, userStorageScope));
    if (storedOrgId) {
      setOrganizationId(storedOrgId);
    }
    const storedConnected = sessionStorage.getItem(buildScopedKey(ONBOARDING_GOOGLE_CONNECTED_KEY, userStorageScope));
    if (storedConnected === "true") {
      setGoogleConnected(true);
    }
    const storedStripeStarted = sessionStorage.getItem(buildScopedKey(ONBOARDING_STRIPE_STARTED_KEY, userStorageScope));
    if (storedStripeStarted === "true") {
      setStripeStarted(true);
      setStripeClientSecret(null);
    }
  }, [applyOnboardingDraft, userStorageScope]);


  useEffect(() => {
    if (typeof window === "undefined" || !userStorageScope) {
      return;
    }
    if (organizationId) {
      sessionStorage.setItem(buildScopedKey(ONBOARDING_ORG_ID_KEY, userStorageScope), organizationId);
    }
  }, [organizationId, userStorageScope]);

  useEffect(() => {
    if (typeof window === "undefined" || !userStorageScope) {
      return;
    }
    sessionStorage.setItem(buildScopedKey(ONBOARDING_GOOGLE_CONNECTED_KEY, userStorageScope), googleConnected ? "true" : "false");
  }, [googleConnected, userStorageScope]);

  useEffect(() => {
    if (typeof window === "undefined" || !userStorageScope) {
      return;
    }
    sessionStorage.setItem(buildScopedKey(ONBOARDING_STRIPE_STARTED_KEY, userStorageScope), stripeStarted ? "true" : "false");
  }, [stripeStarted, userStorageScope]);

  useEffect(() => {
    if (typeof window === "undefined" || !userStorageScope) {
      return;
    }
    const draft = buildOnboardingDraft();
    localStorage.setItem(buildScopedKey(ONBOARDING_DRAFT_KEY, userStorageScope), JSON.stringify(draft));
  }, [buildOnboardingDraft, userStorageScope]);

  const initializeStripeIntent = useCallback(async () => {
    if (!userEmail) {
      setStripeError("Sign in to continue.");
      return;
    }
    const companyName = orgInfo.name.trim();
    if (companyName.length > 0 && companyName.length < 2) {
      setStripeError("Company name must be at least 2 characters. Go back to Business setup and update it.");
      return;
    }
    setStripeLoading(true);
    setStripeError(null);
    setStripeFieldAttention(false);
    setStripeClientSecret(null);
    try {
      const response = await fetch(`${API_BASE_URL}/billing/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: userEmail,
          company_name: companyName || "New client",
          plan: "starter",
        }),
      });
      if (!response.ok) {
        const message = await readErrorMessage(response, "Unable to start Stripe checkout");
        throw new Error(message);
      }
      const payload = await response.json();
      const requiresPaymentMethod = payload?.requires_payment_method !== false;
      const clientSecret = typeof payload?.client_secret === "string" ? payload.client_secret : null;

      if (!requiresPaymentMethod || !clientSecret) {
        setStripeStarted(true);
        setStripeClientSecret(null);
        return;
      }

      setStripeClientSecret(clientSecret);
    } catch (error) {
      const message = normalizeClientError(error, "Unable to start Stripe checkout");
      setStripeError(message);
    } finally {
      setStripeLoading(false);
    }
  }, [orgInfo.name, userEmail]);

  useEffect(() => {
    if (currentStep !== 2) {
      stripeInitAttemptedRef.current = false;
      return;
    }
    if (!userEmail || stripeStarted || stripeClientSecret || stripeLoading || stripeInitAttemptedRef.current) {
      return;
    }
    stripeInitAttemptedRef.current = true;
    void initializeStripeIntent();
  }, [currentStep, initializeStripeIntent, stripeClientSecret, stripeLoading, stripeStarted, userEmail]);

  useEffect(() => {
    if (!stripeFieldAttention) {
      return;
    }
    const timer = window.setTimeout(() => {
      setStripeFieldAttention(false);
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [stripeFieldAttention]);

  const loadOrganizationDraftFromDb = useCallback(
    async (tenantId: string | null | undefined) => {
      if (!tenantId) {
        return;
      }
      const accessToken = await getAccessToken();
      if (!accessToken) {
        return;
      }
      const res = await fetch(`${API_BASE_URL}/orgs/${tenantId}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      if (!res.ok) {
        return;
      }
      const payload = (await res.json()) as { metadata_json?: unknown };
      if (isRecord(payload.metadata_json) && isRecord(payload.metadata_json.onboarding_draft)) {
        applyOnboardingDraft(payload.metadata_json.onboarding_draft);
      }
    },
    [applyOnboardingDraft],
  );

  useEffect(() => {
    let cancelled = false;
    setLoadingClaimStatus(true);
    const run = async () => {
      try {
        setTokenError(null);
        let expectedEmailForClaim = inviteEmailFromQuery;
        // First, if token-based flow exists, redeem it.
        if (inviteToken) {
          const response = await fetch(`${API_BASE_URL}/orgs/onboarding/token`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: inviteToken }),
          });
          if (!response.ok) {
            const message = await readErrorMessage(response, "Invalid or expired onboarding link");
            throw new Error(message);
          }
          const data = await response.json();
          const tokenEmail =
            typeof data.email === "string" && data.email.trim()
              ? data.email.trim().toLowerCase()
              : null;
          if (!expectedEmailForClaim && tokenEmail) {
            expectedEmailForClaim = tokenEmail;
            setResolvedInviteEmail(tokenEmail);
          }
          setOrganizationId(data.organization_id);
          setOrgInfo((prev) => ({ ...prev, name: data.organization_name || prev.name }));
        }

        // Then claim any pending onboarding row by email (Supabase session required)
        const accessToken = await getAccessToken();
        const claimHeaders: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (accessToken) {
          claimHeaders.Authorization = `Bearer ${accessToken}`;
        }
        const claimRes = await fetch("/api/onboarding/claim", {
          method: "POST",
          headers: claimHeaders,
          body: JSON.stringify({ expected_email: expectedEmailForClaim ?? undefined }),
        });
        if (!claimRes.ok) {
          const message = await readErrorMessage(claimRes, "Unable to load onboarding status");
          throw new Error(message);
        }
        const claim = await claimRes.json();
        if (cancelled) {
          return;
        }
        const tenantIdFromClaim = typeof claim.tenant_id === "string" ? claim.tenant_id : null;
        // Claim response is the source of truth for Supabase tenant linkage.
        setOrganizationId((prev) => tenantIdFromClaim ?? prev);
        setOrgInfo((prev) => ({
          ...prev,
          name: claim.business_name || prev.name,
          firstName: claim.first_name || prev.firstName,
          lastName: claim.last_name || prev.lastName,
        }));

        const claimStatus = typeof claim.status === "string" ? claim.status : "in_progress";
        setOnboardingStatus(claimStatus);
        const stepFromStatus = statusToStep(claimStatus);
        setCurrentStep(stepFromStatus);

        if (["stripe_started", "google_pending", "google_connected", "completed", "activated"].includes(claimStatus)) {
          setStripeStarted(true);
          setStripeClientSecret(null);
        }

        if (["google_connected", "completed", "activated"].includes(claimStatus)) {
          setGoogleConnected(true);
        }
        if (typeof claim.agreement_signature === "string") {
          setAgreementSignature(claim.agreement_signature);
        }
        if (typeof claim.agreement_accepted === "boolean") {
          setAgreementAccepted(claim.agreement_accepted);
        }
        if (typeof claim.password_set_at === "string" && claim.password_set_at.trim()) {
          setPasswordSetAt(claim.password_set_at);
        } else if (stepFromStatus >= 1) {
          setPasswordSetAt((prev) => prev ?? new Date(0).toISOString());
        }
        if (isRecord(claim.onboarding_draft)) {
          applyOnboardingDraft(claim.onboarding_draft);
        }
        await loadOrganizationDraftFromDb(tenantIdFromClaim);
      } catch (error) {
        if (!cancelled) {
          setTokenError(normalizeClientError(error, "Unable to redeem onboarding link"));
        }
      } finally {
        if (!cancelled) {
          setLoadingClaimStatus(false);
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [applyOnboardingDraft, inviteEmailFromQuery, inviteToken, loadOrganizationDraftFromDb]);

  const completed = currentStep === steps.length - 1;
  const onboardingFullyCompleted =
    (ONBOARDING_STATUS_RANK[onboardingStatus] ?? -1) >= ONBOARDING_STATUS_RANK.completed;
  const businessSetupSaved =
    Boolean(organizationId) && (ONBOARDING_STATUS_RANK[onboardingStatus] ?? -1) >= ONBOARDING_STATUS_RANK.business_setup;
  const passwordReady = password.length >= 8 && password === confirmPassword;
  const hasPasswordInput = password.length > 0 || confirmPassword.length > 0;
  const passwordAlreadySet = Boolean(passwordSetAt);
  const nextDisabled = useMemo(() => {
    if (currentStep === 0) {
      if (passwordAlreadySet && !hasPasswordInput) {
        return checkingSession || !hasSession || settingPassword;
      }
      return checkingSession || !hasSession || !passwordReady || settingPassword;
    }
    if (currentStep === 1) {
      return !orgInfo.name.trim();
    }
    if (currentStep === 2) {
      return false;
    }
    if (currentStep === 3) {
      return false;
    }
    return false;
  }, [
    checkingSession,
    currentStep,
    hasSession,
    hasPasswordInput,
    orgInfo.name,
    passwordAlreadySet,
    passwordReady,
    settingPassword,
  ]);

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
    tenant_id?: string;
    onboarding_draft?: OnboardingDraftState;
    agreement_signature?: string;
    agreement_accepted?: boolean;
    agreement_signed_at?: string;
    password_set?: boolean;
    password_set_at?: string | null;
  };

  const persistOrganizationDraft = useCallback(
    async (tenantId: string | null | undefined, draft: OnboardingDraftState, businessName?: string) => {
      if (!tenantId) {
        return;
      }
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error("Sign in to continue.");
      }
      const res = await fetch(`${API_BASE_URL}/orgs/${tenantId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          ...(businessName && businessName.trim() ? { name: businessName.trim() } : {}),
          onboarding_draft: draft,
        }),
      });
      if (!res.ok) {
        const message = await readErrorMessage(res, "Failed to persist onboarding draft");
        throw new Error(message);
      }
    },
    [],
  );

  const saveProgress = useCallback(async (payload: SavePayload) => {
    if (!hasSession) {
      throw new Error("Sign in to continue.");
    }
    setSavingProgress(true);
    setProgressError(null);
    try {
      const accessToken = await getAccessToken();
      const res = await fetch("/api/onboarding/save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          ...payload,
          expected_email: resolvedInviteEmail ?? undefined,
        }),
      });
      if (!res.ok) {
        const message = await readErrorMessage(res, "Failed to save progress");
        throw new Error(message);
      }
      const draft = payload.onboarding_draft ?? buildOnboardingDraft();
      const tenantId = payload.tenant_id ?? organizationId;
      await persistOrganizationDraft(tenantId, draft, payload.business_name ?? orgInfo.name);
    } catch (error) {
      const message = normalizeClientError(error, "Failed to save progress");
      setProgressError(message);
      throw error;
    } finally {
      setSavingProgress(false);
    }
  }, [buildOnboardingDraft, hasSession, orgInfo.name, organizationId, persistOrganizationDraft, resolvedInviteEmail]);

  const refreshSession = useCallback(async () => {
    setCheckingSession(true);
    const token = await getAccessToken();
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    setHasSession(Boolean(token && user?.id));
    setUserEmail(user?.email ?? null);
    setUserStorageScope(user?.id ?? null);
    setCheckingSession(false);
  }, []);

  // When landing from a Supabase invite/magic link, exchange the token in the URL for a session
  // so we can read the user's email immediately.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const supabase = createClient();
    const bootstrapSession = async () => {
      try {
        // Hash params (/#access_token=...&refresh_token=...)
        const hash = window.location.hash;
        if (hash.includes("access_token")) {
          const params = new URLSearchParams(hash.slice(1));
          const access_token = params.get("access_token");
          const refresh_token = params.get("refresh_token");
          if (access_token && refresh_token) {
            await supabase.auth.setSession({ access_token, refresh_token });
            window.location.hash = "";
          }
        }

        // PKCE / code param (?code=...) from email link
        const code = new URLSearchParams(window.location.search).get("code");
        if (code) {
          await supabase.auth.exchangeCodeForSession(code);
        }
      } catch {
        // ignore; fall back to normal session check
      } finally {
        await refreshSession();
      }
    };
    void bootstrapSession();
  }, [refreshSession]);

  const handleSetPassword = async () => {
    setPasswordError(null);
    if (!hasSession) {
      setPasswordError("Open the invite link again so we can verify your session.");
      return;
    }
    if (!passwordReady) {
      setPasswordError("Passwords must match and be at least 8 characters.");
      return;
    }
    setSettingPassword(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        throw error;
      }
      await refreshSession();
      const nowIso = new Date().toISOString();
      setPasswordSetAt(nowIso);
      setPassword("");
      setConfirmPassword("");
      const passwordDraft: OnboardingDraftState = {
        ...buildOnboardingDraft(),
        passwordSetAt: nowIso,
      };
      await saveProgress({
        status: "in_progress",
        tenant_id: organizationId ?? undefined,
        onboarding_draft: passwordDraft,
        password_set: true,
        password_set_at: nowIso,
      });
      await goNext();
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : "Failed to set password");
    } finally {
      setSettingPassword(false);
    }
  };

  const createOrganization = async (): Promise<string> => {
    if (organizationId) {
      return organizationId;
    }
    if (creatingOrg) {
      throw new Error("Organization creation already in progress.");
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
        const message = await readErrorMessage(response, "Unable to create organization");
        throw new Error(message);
      }
      const org = await response.json();
      setOrganizationId(org.id);
      return org.id;
    } catch (error) {
      setCreateOrgError(normalizeClientError(error, "Failed to create organization"));
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
        const message = await readErrorMessage(response, "Unable to start Google OAuth");
        throw new Error(message);
      }
      const data = await response.json();
      if (typeof window !== "undefined") {
        window.location.href = data.authorization_url;
      }
    } catch (error) {
      setConnectError(normalizeClientError(error, "Failed to connect Google"));
    } finally {
      setConnectingGoogle(false);
    }
  };

  const statusForStep = (
    step: number,
    overrides?: { stripeStarted?: boolean; googleConnected?: boolean },
  ) => {
    const effectiveStripeStarted = overrides?.stripeStarted ?? stripeStarted;
    const effectiveGoogleConnected = overrides?.googleConnected ?? googleConnected;

    switch (step) {
      case 1:
        return "business_setup";
      case 2:
        return effectiveStripeStarted ? "stripe_started" : "stripe_pending";
      case 3:
        return effectiveGoogleConnected ? "completed" : "google_pending";
      default:
        return "in_progress";
    }
  };

  const goNext = async (
    overrides?: { stripeStarted?: boolean; googleConnected?: boolean },
  ) => {
    let resolvedTenantId = organizationId;
    const nextStatus = statusForStep(currentStep, overrides);
    if (currentStep === 1 && !resolvedTenantId) {
      try {
        resolvedTenantId = await createOrganization();
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
          status: nextStatus,
          tenant_id: resolvedTenantId ?? undefined,
          onboarding_draft: buildOnboardingDraft(overrides),
          password_set: Boolean(passwordSetAt),
          password_set_at: passwordSetAt,
        });
      } else if (currentStep > 1 && currentStep < steps.length) {
        await saveProgress({
          status: nextStatus,
          tenant_id: resolvedTenantId ?? undefined,
          onboarding_draft: buildOnboardingDraft(overrides),
          agreement_signature: agreementSignature.trim() || undefined,
          agreement_accepted: agreementAccepted,
          agreement_signed_at: agreementAccepted && agreementSignature.trim() ? new Date().toISOString() : undefined,
          password_set: Boolean(passwordSetAt),
          password_set_at: passwordSetAt,
        });
      }
    } catch {
      return;
    }

    if (currentStep >= 1 && currentStep < steps.length) {
      setOnboardingStatus((prev) =>
        (ONBOARDING_STATUS_RANK[nextStatus] ?? -1) > (ONBOARDING_STATUS_RANK[prev] ?? -1) ? nextStatus : prev,
      );
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

  useEffect(() => {
    if (typeof window === "undefined" || !userStorageScope) return;
    const key = buildScopedKey(ONBOARDING_STEP_KEY, userStorageScope);
    localStorage.setItem(key, String(currentStep));
    sessionStorage.setItem(key, String(currentStep));
  }, [currentStep, userStorageScope]);

  const handleContinue = async () => {
    if (currentStep === 0) {
      if (passwordAlreadySet && !hasPasswordInput) {
        await goNext();
        return;
      }
      await handleSetPassword();
      return;
    }
    if (currentStep === 2) {
      setAgreementError(null);
      if (!agreementSignature.trim()) {
        setAgreementError("Type your full name to sign the agreement.");
        return;
      }
      if (!agreementAccepted) {
        setAgreementError("Accept the agreement before continuing.");
        return;
      }
      if (!stripeStarted) {
        if (!stripeClientSecret) {
          return;
        }
        const ok = await stripeSectionRef.current?.submit();
        if (!ok) {
          return;
        }
      }
      await goNext({ stripeStarted: true });
      return;
    }
    await goNext();
  };

  const handleFinishOnboarding = async () => {
    setFinalizingOnboarding(true);
    try {
      await saveProgress({
        status: "completed",
        tenant_id: organizationId ?? undefined,
        onboarding_draft: buildOnboardingDraft({ stripeStarted: true, googleConnected }),
        agreement_signature: agreementSignature.trim() || undefined,
        agreement_accepted: agreementAccepted,
        agreement_signed_at: agreementAccepted && agreementSignature.trim() ? new Date().toISOString() : undefined,
        password_set: Boolean(passwordSetAt),
        password_set_at: passwordSetAt,
      });
      setOnboardingStatus("completed");
      router.replace("/dashboard");
      router.refresh();
    } catch (error) {
      setProgressError(normalizeClientError(error, "Unable to finalize onboarding"));
    } finally {
      setFinalizingOnboarding(false);
    }
  };

  if (loadingClaimStatus) {
    return <div className="min-h-screen px-6 py-12 text-center text-slate-600">Checking onboarding status…</div>;
  }

  if (onboardingFullyCompleted) {
    return (
      <div className="min-h-screen bg-slate-50 px-6 py-12">
        <div className="mx-auto max-w-2xl space-y-6 rounded-3xl bg-white p-8 text-center shadow-sm">
          <p className="text-xs uppercase tracking-[0.3em] text-primary">Onboarding Complete</p>
          <h1 className="text-3xl font-semibold">Your account setup is finished</h1>
          <p className="text-sm text-slate-600">You can now open your personal client dashboard.</p>
          <button
            className="inline-block rounded-full bg-primary px-6 py-3 text-sm font-semibold text-white"
            onClick={() => {
              router.replace("/dashboard");
              router.refresh();
            }}
          >
            Go to dashboard
          </button>
          <div className="space-y-2 text-sm text-slate-600">
            <p>You can also log in through the company website login page any time.</p>
            <p>All onboarding information can be edited later from your dashboard settings.</p>
          </div>
        </div>
      </div>
    );
  }

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
              <h2 className="text-xl font-semibold">Set your password</h2>
              <p className="text-sm text-slate-600">
                We already have your email from the invite. Choose a password to finish signing in and continue setup.
              </p>
              <p className="text-sm font-semibold text-slate-800">
                Email: <span className="text-primary">{userEmail ?? "Loading email…"}</span>
              </p>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <button
                  className="rounded-full border border-slate-200 px-4 py-2 font-semibold text-slate-700 disabled:opacity-60"
                  onClick={() => {
                    void refreshSession();
                  }}
                  disabled={checkingSession}
                >
                  {checkingSession ? "Refreshing…" : "Refresh session"}
                </button>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className="text-slate-600">Password</span>
                  <input
                    type="password"
                    className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2"
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="text-slate-600">Confirm password</span>
                  <input
                    type="password"
                    className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2"
                    placeholder="Re-enter password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                  />
                </label>
              </div>
              {passwordError && <p className="text-sm text-rose-600">{passwordError}</p>}
              {passwordAlreadySet && (
                <p className="text-sm text-emerald-700">
                  Password already set. For security, your password cannot be displayed.
                </p>
              )}
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <span className={`h-2 w-2 rounded-full ${hasSession ? "bg-emerald-500" : "bg-amber-500"}`} />
                <span>
                  {checkingSession
                    ? "Looking for an active session..."
                    : hasSession
                      ? passwordAlreadySet
                        ? "Session verified. Continue, or enter a new password to replace the current one."
                        : "Session verified. Set your password to continue."
                      : "No active session found. Open the latest invite email and try again."}
                </span>
              </div>
            </div>
          )}

          {currentStep === 1 && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold">Business setup</h2>
              <p className="text-sm text-slate-600">
                Save this step when finished. You can edit all business details later from your dashboard settings.
              </p>
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
                <div className="space-y-3 rounded-2xl border border-slate-200 p-4">
                  <p className="text-slate-700">
                    Primary location is where the business is located. Secondary locations are additional areas where the business provides services.
                  </p>
                  <div className="space-y-2">
                    <p className="font-medium text-slate-700">Primary location (optional)</p>
                    <div className="grid gap-2 md:grid-cols-2">
                      <input
                        className="w-full rounded-2xl border border-slate-200 px-3 py-2"
                        placeholder="Enter: City"
                        value={orgInfo.primaryLocationCity}
                        onChange={(event) => setOrgInfo((prev) => ({ ...prev, primaryLocationCity: event.target.value }))}
                      />
                      <input
                        className="w-full rounded-2xl border border-slate-200 px-3 py-2"
                        placeholder="Enter: State"
                        value={orgInfo.primaryLocationState}
                        onChange={(event) => setOrgInfo((prev) => ({ ...prev, primaryLocationState: event.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-700">
                        Secondary locations ({orgInfo.secondaryLocations.length}/{MAX_SECONDARY_LOCATIONS})
                      </span>
                      <button
                        type="button"
                        className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 disabled:opacity-50"
                        onClick={() =>
                          setOrgInfo((prev) => {
                            if (prev.secondaryLocations.length >= MAX_SECONDARY_LOCATIONS) {
                              return prev;
                            }
                            return { ...prev, secondaryLocations: [...prev.secondaryLocations, emptyLocationInput()] };
                          })
                        }
                        disabled={orgInfo.secondaryLocations.length >= MAX_SECONDARY_LOCATIONS}
                      >
                        + Add location
                      </button>
                    </div>
                    <div className="space-y-2">
                      {orgInfo.secondaryLocations.map((value, index) => (
                        <div key={`secondary-${index}`} className="grid gap-2 md:grid-cols-2">
                          <input
                            className="w-full rounded-2xl border border-slate-200 px-3 py-2"
                            placeholder={`Enter: City ${index + 1}`}
                            value={value.city}
                            onChange={(event) =>
                              setOrgInfo((prev) => {
                                const next = [...prev.secondaryLocations];
                                next[index] = { ...next[index], city: event.target.value };
                                return { ...prev, secondaryLocations: next };
                              })
                            }
                          />
                          <input
                            className="w-full rounded-2xl border border-slate-200 px-3 py-2"
                            placeholder={`Enter: State ${index + 1}`}
                            value={value.state}
                            onChange={(event) =>
                              setOrgInfo((prev) => {
                                const next = [...prev.secondaryLocations];
                                next[index] = { ...next[index], state: event.target.value };
                                return { ...prev, secondaryLocations: next };
                              })
                            }
                          />
                        </div>
                      ))}
                    </div>
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
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-semibold text-slate-500">Tone examples</p>
                    <div className="mt-2 space-y-2">
                      {toneOptions.map((tone) => (
                        <div
                          key={`tone-example-${tone}`}
                          className={`rounded-xl border px-3 py-2 text-xs ${
                            brandVoice.tone === tone ? "border-primary/40 bg-white text-slate-900" : "border-slate-200 text-slate-700"
                          }`}
                        >
                          <p className="font-semibold">{tone}</p>
                          <p>{toneSentenceSamples[tone]}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Services ({brandVoice.services.length}/{MAX_SERVICE_ROWS})</span>
                      <button
                        type="button"
                        className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 disabled:opacity-50"
                        onClick={() =>
                          setBrandVoice((prev) => {
                            if (prev.services.length >= MAX_SERVICE_ROWS) {
                              return prev;
                            }
                            return { ...prev, services: [...prev.services, ""] };
                          })
                        }
                        disabled={brandVoice.services.length >= MAX_SERVICE_ROWS}
                      >
                        + Add service
                      </button>
                    </div>
                    <div className="space-y-2">
                      {brandVoice.services.map((service, index) => (
                        <input
                          key={`service-${index}`}
                          className="w-full rounded-2xl border border-slate-200 px-3 py-2"
                          placeholder={`Service ${index + 1}`}
                          value={service}
                          onChange={(event) =>
                            setBrandVoice((prev) => {
                              const next = [...prev.services];
                              next[index] = event.target.value;
                              return { ...prev, services: next };
                            })
                          }
                        />
                      ))}
                    </div>
                  </div>
                  <label className="block">
                    <span className="text-slate-600">Optional: Paste a link to your current website (if any)</span>
                    <input
                      type="url"
                      className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2"
                      placeholder="https://www.yourbusiness.com"
                      value={brandVoice.websiteText}
                      onChange={(event) => setBrandVoice((prev) => ({ ...prev, websiteText: event.target.value }))}
                    />
                  </label>
                  <div className="rounded-2xl bg-slate-50 p-4 text-sm">
                    <p className="text-xs font-semibold text-slate-500">Preview</p>
                    <p className="text-slate-700">
                      {brandVoice.tone} tone with services{" "}
                      {brandVoice.services.map((service) => service.trim()).filter(Boolean).join(", ") || "—"}.
                    </p>
                  </div>
                </div>
              </div>
              {createOrgError && <p className="text-sm text-rose-600">{createOrgError}</p>}
              {businessSetupSaved && (
                <p className="text-xs text-emerald-600">
                  Business setup is saved for this account. Organization ID <span className="font-mono">{organizationId}</span>
                </p>
              )}
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">Sign up for Stripe</h2>
              <p className="text-sm text-slate-600">
                You are signing up for the Map Pack 3 service plan at <span className="font-semibold">$5/month</span>.
              </p>
              <p className="text-sm text-slate-600">Pay securely without leaving onboarding. After payment succeeds, sign and click Continue.</p>
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
                      setStripeClientSecret(null);
                      setStripeFieldAttention(false);
                    }}
                    setError={setStripeError}
                    setSubmitting={setStripeSubmitting}
                    submitting={stripeSubmitting}
                    showValidationCue={stripeFieldAttention}
                    onValidationIssue={() => {
                      setStripeFieldAttention(true);
                    }}
                  />
                </Elements>
              ) : stripeStarted ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  Payment received. Your subscription is active and you can continue onboarding.
                </div>
              ) : (
                <p className="text-sm text-amber-600">Add business info first so the payment form can load.</p>
              )}
              <div className="space-y-3 rounded-2xl border border-slate-200 p-4">
                <p className="text-sm text-slate-700">
                  By signing below, you agree to recurring billing of <span className="font-semibold">$5/month</span> for this service until canceled.
                </p>
                <label className="block">
                  <span className="text-sm text-slate-600">Typed signature (full name)</span>
                  <input
                    className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2"
                    placeholder="Your full legal name"
                    value={agreementSignature}
                    onChange={(event) => {
                      setAgreementSignature(event.target.value);
                      if (agreementError) setAgreementError(null);
                    }}
                  />
                </label>
                <label className="flex items-start gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={agreementAccepted}
                    onChange={(event) => {
                      setAgreementAccepted(event.target.checked);
                      if (agreementError) setAgreementError(null);
                    }}
                  />
                  <span>I agree to these billing terms and authorize recurring payments.</span>
                </label>
                {agreementError && <p className="text-sm text-rose-600">{agreementError}</p>}
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
              {!googleConnected && (
                <p className="text-xs text-slate-500">
                  No GBP account yet? You can continue now and connect Google later from the dashboard.
                </p>
              )}
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
              <p className="text-sm text-slate-600">
                After setup, all onboarding information can still be edited later from your dashboard settings.
              </p>
              <button
                className="inline-block rounded-full bg-primary px-6 py-3 text-sm font-semibold text-white disabled:opacity-50"
                onClick={() => {
                  void handleFinishOnboarding();
                }}
                disabled={finalizingOnboarding || savingProgress}
              >
                {finalizingOnboarding || savingProgress ? "Finalizing..." : "Go to dashboard"}
              </button>
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
                (currentStep === 2 && (stripeLoading || stripeSubmitting || (!stripeStarted && !stripeClientSecret)))
              }
            >
              {currentStep === 2
                ? stripeStarted
                  ? "Continue"
                  : stripeSubmitting
                  ? "Processing…"
                  : "Pay & continue"
                : currentStep === 0
                  ? settingPassword
                    ? "Saving…"
                    : passwordAlreadySet && !hasPasswordInput
                      ? "Continue"
                      : "Save password"
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

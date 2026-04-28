"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getAccessToken } from "@/lib/supabase/session";

const steps = ["Google login + GBP", "Business info + services", "Stripe payment"];

const toneOptions = ["Friendly", "Professional", "Bold", "Concise"];
const toneSentenceSamples: Record<string, string> = {
  Friendly: "Hey neighbors, we just finished another same-day AC repair and we are here if your system needs help.",
  Professional: "Our team provides licensed HVAC maintenance with clear diagnostics and scheduled follow-up service.",
  Bold: "Stop settling for weak airflow - our technicians fix root causes fast and keep your home comfortable.",
  Concise: "Fast HVAC repair, clear pricing, and reliable results.",
};
const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000").trim().replace(/\/+$/, "");
const ONBOARDING_DRAFT_KEY = "onboarding:draft:v1";
const ONBOARDING_ORG_ID_KEY = "onboarding:orgId:v1";
const ONBOARDING_GOOGLE_CONNECTED_KEY = "onboarding:googleConnected:v1";
const DEFAULT_LIST_ROWS = 3;
const MAX_SECONDARY_LOCATIONS = 10;
const MAX_SERVICE_ROWS = 10;
const MAX_ONBOARDING_STEP = steps.length - 1;

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
type LocationInput = {
  city: string;
  state: string;
};
type OrgInfoState = {
  name: string;
  firstName: string;
  lastName: string;
  contactName: string;
  contactEmail: string;
  phone: string;
  addressOrServiceArea: string;
  primaryCategory: string;
  primaryLocationCity: string;
  primaryLocationState: string;
  secondaryLocations: LocationInput[];
  existingBusinessDescription: string;
};
type BrandVoiceState = {
  tone: string;
  websiteText: string;
};
type ServiceEntry = {
  name: string;
  description: string;
  source: "imported" | "manual" | "ai";
};
type GoogleAccountOption = {
  id: string;
  displayName: string;
  externalAccountId: string | null;
};
type GoogleLocationOption = {
  name: string;
  title: string | null;
  storeCode: string | null;
  metadata: Record<string, unknown> | null;
};
type SelectedGoogleLocation = {
  accountId: string | null;
  accountName: string | null;
  locationName: string | null;
  locationTitle: string | null;
  connectedLocationId: string | null;
  metadata: Record<string, unknown> | null;
};
type OnboardingDraftState = {
  organizationId?: string;
  orgInfo?: Partial<OrgInfoState>;
  brandVoice?: Partial<BrandVoiceState>;
  services?: ServiceEntry[];
  importedBusinessFields?: string[];
  selectedGoogleAccountId?: string | null;
  selectedGoogleLocationName?: string | null;
  selectedGoogleLocation?: Partial<SelectedGoogleLocation> | null;
  googleConnected?: boolean;
  agreementAccepted?: boolean;
  agreementSignature?: string;
  passwordSetAt?: string | null;
};
type InviteMismatchState = {
  signedInEmail: string | null;
  inviteEmail: string | null;
};

const defaultOrgInfo: OrgInfoState = {
  name: "",
  firstName: "",
  lastName: "",
  contactName: "",
  contactEmail: "",
  phone: "",
  addressOrServiceArea: "",
  primaryCategory: "",
  primaryLocationCity: "",
  primaryLocationState: "",
  secondaryLocations: Array.from({ length: DEFAULT_LIST_ROWS }, () => ({ city: "", state: "" })),
  existingBusinessDescription: "",
};

const defaultBrandVoice: BrandVoiceState = {
  tone: toneOptions[0],
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

const normalizeServiceEntries = (value: unknown): ServiceEntry[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .slice(0, MAX_SERVICE_ROWS)
    .map((item) => {
      if (!isRecord(item)) return null;
      const name = typeof item.name === "string" ? item.name : "";
      const description = typeof item.description === "string" ? item.description : "";
      const sourceRaw = typeof item.source === "string" ? item.source : "";
      const source: ServiceEntry["source"] =
        sourceRaw === "imported" || sourceRaw === "ai" || sourceRaw === "manual"
          ? sourceRaw
          : "manual";
      return { name, description, source };
    })
    .filter((entry): entry is ServiceEntry => Boolean(entry));
};

const createServiceEntriesFromNames = (services: string[]): ServiceEntry[] =>
  services
    .map((name) => name.trim())
    .filter(Boolean)
    .slice(0, MAX_SERVICE_ROWS)
    .map((name) => ({ name, description: "", source: "imported" }));

const statusToResumeStep = (status?: string | null) => {
  switch (status) {
    case "business_setup":
      return 1;
    case "stripe_pending":
    case "stripe_started":
    case "google_pending":
    case "google_connected":
    case "completed":
    case "activated":
      return 2;
    default:
      return 0;
  }
};

const normalizeStepIndex = (value: unknown): number | null => {
  const numeric = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim()
      ? Number(value.trim())
      : Number.NaN;
  if (!Number.isInteger(numeric)) return null;
  if (numeric < 0 || numeric > MAX_ONBOARDING_STEP) return null;
  return numeric;
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

const shouldIgnoreBackendDraftPersistError = (status: number, message: string) => {
  if (status !== 403 && status !== 404) {
    return false;
  }
  const normalized = message.trim().toLowerCase();
  return normalized.includes("not a member of this organization") || normalized.includes("organization not found");
};

const SUPABASE_PASSWORD_SET_METADATA_KEY = "onboarding_password_set_at";

const readSupabasePasswordSetAt = (value: unknown): string | null => {
  if (!isRecord(value) || !isRecord(value.user_metadata)) {
    return null;
  }
  const raw = value.user_metadata[SUPABASE_PASSWORD_SET_METADATA_KEY];
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
};

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
  const [passwordSetAt, setPasswordSetAt] = useState<string | null>(null);
  const [stripeStarted, setStripeStarted] = useState(false);
  const [stripeLoading, setStripeLoading] = useState(false);
  const [stripeError, setStripeError] = useState<string | null>(null);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const [agreementSignature, setAgreementSignature] = useState("");
  const [agreementError, setAgreementError] = useState<string | null>(null);
  const [loadingClaimStatus, setLoadingClaimStatus] = useState(true);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [orgInfo, setOrgInfo] = useState<OrgInfoState>(defaultOrgInfo);
  const [creatingOrg, setCreatingOrg] = useState(false);
  const [createOrgError, setCreateOrgError] = useState<string | null>(null);
  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [claimErrorCode, setClaimErrorCode] = useState<string | null>(null);
  const [inviteMismatch, setInviteMismatch] = useState<InviteMismatchState | null>(null);
  const [switchingAccount, setSwitchingAccount] = useState(false);
  const [brandVoice, setBrandVoice] = useState<BrandVoiceState>(defaultBrandVoice);
  const [services, setServices] = useState<ServiceEntry[]>([]);
  const [importedBusinessFields, setImportedBusinessFields] = useState<string[]>([]);
  const [googleAccounts, setGoogleAccounts] = useState<GoogleAccountOption[]>([]);
  const [loadingGoogleAccounts, setLoadingGoogleAccounts] = useState(false);
  const [selectedGoogleAccountId, setSelectedGoogleAccountId] = useState<string | null>(null);
  const [googleLocations, setGoogleLocations] = useState<GoogleLocationOption[]>([]);
  const [loadingGoogleLocations, setLoadingGoogleLocations] = useState(false);
  const [selectedGoogleLocationName, setSelectedGoogleLocationName] = useState<string | null>(null);
  const [connectingGoogleLocation, setConnectingGoogleLocation] = useState(false);
  const [selectedGoogleLocation, setSelectedGoogleLocation] = useState<SelectedGoogleLocation | null>(null);
  const [serviceError, setServiceError] = useState<string | null>(null);
  const [serviceGenerationError, setServiceGenerationError] = useState<string | null>(null);
  const [generatingServiceIndex, setGeneratingServiceIndex] = useState<number | null>(null);
  const inviteToken = searchParams?.get("token") ?? null;
  const oauthStatusFromQuery = searchParams?.get("oauth");
  const [authBootstrapComplete, setAuthBootstrapComplete] = useState(false);
  const authClient = useMemo(() => createClient(), []);
  const getScopedAccessToken = useCallback(async () => getAccessToken(authClient), [authClient]);

  const buildOnboardingDraft = useCallback(
    (overrides?: { googleConnected?: boolean }): OnboardingDraftState => ({
      organizationId: organizationId ?? undefined,
      orgInfo,
      brandVoice,
      services,
      importedBusinessFields,
      selectedGoogleAccountId,
      selectedGoogleLocationName,
      selectedGoogleLocation,
      googleConnected: overrides?.googleConnected ?? googleConnected,
      agreementAccepted,
      agreementSignature,
      passwordSetAt,
    }),
    [
      agreementAccepted,
      agreementSignature,
      brandVoice,
      importedBusinessFields,
      googleConnected,
      orgInfo,
      organizationId,
      passwordSetAt,
      selectedGoogleAccountId,
      selectedGoogleLocation,
      selectedGoogleLocationName,
      services,
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
        contactName: typeof orgInfoDraft.contactName === "string" ? orgInfoDraft.contactName : prev.contactName,
        contactEmail: typeof orgInfoDraft.contactEmail === "string" ? orgInfoDraft.contactEmail : prev.contactEmail,
        phone: typeof orgInfoDraft.phone === "string" ? orgInfoDraft.phone : prev.phone,
        addressOrServiceArea:
          typeof orgInfoDraft.addressOrServiceArea === "string"
            ? orgInfoDraft.addressOrServiceArea
            : prev.addressOrServiceArea,
        primaryCategory: typeof orgInfoDraft.primaryCategory === "string" ? orgInfoDraft.primaryCategory : prev.primaryCategory,
        primaryLocationCity: normalizedPrimary ? normalizedPrimary.city : prev.primaryLocationCity,
        primaryLocationState: normalizedPrimary ? normalizedPrimary.state : prev.primaryLocationState,
        secondaryLocations:
          orgInfoDraft.secondaryLocations !== undefined
            ? normalizeSecondaryLocations(orgInfoDraft.secondaryLocations)
            : prev.secondaryLocations,
        existingBusinessDescription:
          typeof orgInfoDraft.existingBusinessDescription === "string"
            ? orgInfoDraft.existingBusinessDescription
            : prev.existingBusinessDescription,
      }));
    }
    if (brandVoiceDraft) {
      setBrandVoice((prev) => ({
        ...prev,
        tone: typeof brandVoiceDraft.tone === "string" ? brandVoiceDraft.tone : prev.tone,
        websiteText: typeof brandVoiceDraft.websiteText === "string" ? brandVoiceDraft.websiteText : prev.websiteText,
      }));
    }
    const serviceDraft = rawDraft.services;
    if (serviceDraft !== undefined) {
      const normalizedServices = normalizeServiceEntries(serviceDraft);
      if (normalizedServices.length > 0) {
        setServices(normalizedServices);
      }
    } else if (brandVoiceDraft?.services !== undefined) {
      const legacyServices = normalizeServiceList(brandVoiceDraft.services);
      setServices(createServiceEntriesFromNames(legacyServices));
    }
    if (Array.isArray(rawDraft.importedBusinessFields)) {
      setImportedBusinessFields(
        rawDraft.importedBusinessFields.filter((item): item is string => typeof item === "string"),
      );
    }
    if (typeof rawDraft.selectedGoogleAccountId === "string" && rawDraft.selectedGoogleAccountId.trim()) {
      setSelectedGoogleAccountId(rawDraft.selectedGoogleAccountId.trim());
    }
    if (typeof rawDraft.selectedGoogleLocationName === "string" && rawDraft.selectedGoogleLocationName.trim()) {
      setSelectedGoogleLocationName(rawDraft.selectedGoogleLocationName.trim());
    }
    if (isRecord(rawDraft.selectedGoogleLocation)) {
      setSelectedGoogleLocation({
        accountId:
          typeof rawDraft.selectedGoogleLocation.accountId === "string"
            ? rawDraft.selectedGoogleLocation.accountId
            : null,
        accountName:
          typeof rawDraft.selectedGoogleLocation.accountName === "string"
            ? rawDraft.selectedGoogleLocation.accountName
            : null,
        locationName:
          typeof rawDraft.selectedGoogleLocation.locationName === "string"
            ? rawDraft.selectedGoogleLocation.locationName
            : null,
        locationTitle:
          typeof rawDraft.selectedGoogleLocation.locationTitle === "string"
            ? rawDraft.selectedGoogleLocation.locationTitle
            : null,
        connectedLocationId:
          typeof rawDraft.selectedGoogleLocation.connectedLocationId === "string"
            ? rawDraft.selectedGoogleLocation.connectedLocationId
            : null,
        metadata: isRecord(rawDraft.selectedGoogleLocation.metadata) ? rawDraft.selectedGoogleLocation.metadata : null,
      });
    }
    if (typeof rawDraft.googleConnected === "boolean") {
      setGoogleConnected(rawDraft.googleConnected);
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
    if (!userEmail) {
      return;
    }
    setOrgInfo((prev) => ({
      ...prev,
      contactEmail: prev.contactEmail || userEmail,
      contactName: prev.contactName || [prev.firstName, prev.lastName].filter(Boolean).join(" "),
    }));
  }, [userEmail]);

  useEffect(() => {
    let active = true;
    const checkSession = async () => {
      try {
        const token = await getScopedAccessToken();
        if (!active) return;
        const { data, error } = await authClient.auth.getUser();
        if (error) {
          throw error;
        }
        const user = data.user;
        const verifiedPasswordSetAt = readSupabasePasswordSetAt(user);
        setHasSession(Boolean(token && user?.id));
        setUserEmail(user?.email ?? null);
        setUserStorageScope(user?.id ?? null);
        if (verifiedPasswordSetAt) {
          setPasswordSetAt((prev) => prev ?? verifiedPasswordSetAt);
        }
      } catch {
        if (!active) {
          return;
        }
        setHasSession(false);
        setUserEmail(null);
        setUserStorageScope(null);
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
  }, [authClient, getScopedAccessToken]);

  useEffect(() => {
    if (typeof window === "undefined" || !userStorageScope) {
      return;
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
    const draft = buildOnboardingDraft();
    localStorage.setItem(buildScopedKey(ONBOARDING_DRAFT_KEY, userStorageScope), JSON.stringify(draft));
  }, [buildOnboardingDraft, userStorageScope]);

  const loadOrganizationDraftFromDb = useCallback(
    async (tenantId: string | null | undefined) => {
      if (!tenantId) {
        return;
      }
      const accessToken = await getScopedAccessToken();
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
    [applyOnboardingDraft, getScopedAccessToken],
  );

  useEffect(() => {
    if (!authBootstrapComplete) {
      return;
    }
    let cancelled = false;
    setLoadingClaimStatus(true);
    const run = async () => {
      try {
        setTokenError(null);
        setClaimErrorCode(null);
        setInviteMismatch(null);
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
        const accessToken = await getScopedAccessToken();
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
          let message = "Unable to load onboarding status";
          const bodyText = await claimRes.text();
          if (bodyText) {
            try {
              const payload = JSON.parse(bodyText) as {
                error?: unknown;
                code?: unknown;
                message?: unknown;
                signed_in_email?: unknown;
                invite_email?: unknown;
              };
              if (typeof payload.error === "string" && payload.error.trim()) {
                message = payload.error.trim();
              } else if (typeof payload.message === "string" && payload.message.trim()) {
                message = payload.message.trim();
              } else {
                message = bodyText;
              }
              if (typeof payload.code === "string" && payload.code.trim()) {
                const code = payload.code.trim().toLowerCase();
                setClaimErrorCode(code);
                if (code === "invite_email_mismatch") {
                  setInviteMismatch({
                    signedInEmail:
                      typeof payload.signed_in_email === "string" && payload.signed_in_email.trim()
                        ? payload.signed_in_email.trim().toLowerCase()
                        : null,
                    inviteEmail:
                      typeof payload.invite_email === "string" && payload.invite_email.trim()
                        ? payload.invite_email.trim().toLowerCase()
                        : expectedEmailForClaim,
                  });
                }
              }
            } catch {
              message = bodyText;
            }
          }
          throw new Error(message);
        }
        const claim = await claimRes.json();
        if (cancelled) {
          return;
        }
        setInviteMismatch(null);
        const tenantIdFromClaim = typeof claim.tenant_id === "string" ? claim.tenant_id : null;
        // Claim response is the source of truth for Supabase tenant linkage.
        setOrganizationId((prev) => tenantIdFromClaim ?? prev);
        setOrgInfo((prev) => ({
          ...prev,
          name: claim.business_name || prev.name,
          firstName: claim.first_name || prev.firstName,
          lastName: claim.last_name || prev.lastName,
          contactName: prev.contactName || [claim.first_name, claim.last_name].filter(Boolean).join(" "),
          contactEmail: prev.contactEmail || userEmail || "",
        }));

        const claimStatus = typeof claim.status === "string" ? claim.status : "in_progress";
        setOnboardingStatus(claimStatus);
        const claimPasswordSetAt = typeof claim.password_set_at === "string" && claim.password_set_at.trim()
          ? claim.password_set_at
          : null;
        const stepFromStatus = normalizeStepIndex(claim.resume_step) ?? statusToResumeStep(claimStatus);
        setCurrentStep(stepFromStatus);

        if (["google_pending", "google_connected", "completed", "activated"].includes(claimStatus)) {
          setStripeStarted(true);
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
        if (claimPasswordSetAt) {
          setPasswordSetAt(claimPasswordSetAt);
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
  }, [applyOnboardingDraft, authBootstrapComplete, getScopedAccessToken, inviteEmailFromQuery, inviteToken, loadOrganizationDraftFromDb, userEmail]);

  const hasInviteContext = Boolean(inviteToken || inviteEmailFromQuery);
  const onboardingFullyCompleted =
    (ONBOARDING_STATUS_RANK[onboardingStatus] ?? -1) >= ONBOARDING_STATUS_RANK.completed;
  const businessSetupSaved =
    Boolean(organizationId) && (ONBOARDING_STATUS_RANK[onboardingStatus] ?? -1) >= ONBOARDING_STATUS_RANK.business_setup;

  useEffect(() => {
    if (searchParams?.get("payment") !== "success" || !onboardingFullyCompleted) {
      return;
    }
    router.replace("/dashboard");
    router.refresh();
  }, [onboardingFullyCompleted, router, searchParams]);

  const hasConnectedGbpLocation =
    googleConnected &&
    Boolean(selectedGoogleLocation?.locationName) &&
    Boolean(selectedGoogleAccountId);
  const missingBusinessFields = useMemo(() => {
    const missing: string[] = [];
    if (!orgInfo.name.trim()) missing.push("Company name");
    if (!orgInfo.addressOrServiceArea.trim()) missing.push("Address or service area");
    if (!orgInfo.phone.trim()) missing.push("Phone number");
    if (!orgInfo.contactName.trim()) missing.push("Contact name");
    if (!orgInfo.contactEmail.trim()) missing.push("Contact email");
    if (orgInfo.contactEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(orgInfo.contactEmail.trim())) {
      missing.push("Valid contact email");
    }
    if (!orgInfo.primaryCategory.trim()) missing.push("Primary category");
    if (!orgInfo.primaryLocationCity.trim()) missing.push("Primary location city");
    if (!orgInfo.primaryLocationState.trim()) missing.push("Primary location state");
    return missing;
  }, [
    orgInfo.name,
    orgInfo.addressOrServiceArea,
    orgInfo.contactEmail,
    orgInfo.contactName,
    orgInfo.phone,
    orgInfo.primaryCategory,
    orgInfo.primaryLocationCity,
    orgInfo.primaryLocationState,
  ]);
  const namedServicesCount = useMemo(
    () => services.filter((service) => service.name.trim()).length,
    [services],
  );
  const servicesMissingDescriptions = useMemo(
    () =>
      services.filter(
        (service) => service.name.trim() && !service.description.trim(),
      ),
    [services],
  );

  const nextDisabled = useMemo(() => {
    if (currentStep === 0) {
      return checkingSession || !hasSession || !orgInfo.firstName.trim() || !orgInfo.lastName.trim() || !hasConnectedGbpLocation;
    }
    if (currentStep === 1) {
      return missingBusinessFields.length > 0 || namedServicesCount === 0 || servicesMissingDescriptions.length > 0;
    }
    return false;
  }, [
    checkingSession,
    currentStep,
    hasConnectedGbpLocation,
    hasSession,
    missingBusinessFields.length,
    namedServicesCount,
    orgInfo.firstName,
    orgInfo.lastName,
    servicesMissingDescriptions.length,
  ]);

  const progress = useMemo(() => ((currentStep + 1) / steps.length) * 100, [currentStep]);

  type SavePayload = {
    business_name?: string;
    first_name?: string;
    last_name?: string;
    status?: string;
    tenant_id?: string;
    client_step?: number;
    onboarding_draft?: OnboardingDraftState;
    agreement_signature?: string;
    agreement_accepted?: boolean;
    agreement_signed_at?: string;
    password_set?: boolean;
    password_set_at?: string | null;
  };

  type SaveResponse = {
    status?: unknown;
    resume_step?: unknown;
    pending?: unknown;
  };

  const persistOrganizationDraft = useCallback(
    async (tenantId: string | null | undefined, draft: OnboardingDraftState, businessName?: string) => {
      if (!tenantId) {
        return;
      }
      const accessToken = await getScopedAccessToken();
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
        if (shouldIgnoreBackendDraftPersistError(res.status, message)) {
          console.info("Skipping backend onboarding draft persistence during onboarding", {
            tenantId,
            status: res.status,
            message,
          });
          return;
        }
        throw new Error(message);
      }
      const locationId = draft.selectedGoogleLocation?.connectedLocationId;
      const serviceNames = (draft.services ?? [])
        .map((service) => service.name.trim())
        .filter(Boolean);
      if (locationId && serviceNames.length > 0) {
        const settingsRes = await fetch(`${API_BASE_URL}/orgs/locations/${locationId}/settings`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            services: serviceNames,
            voice_profile: {
              tone: draft.brandVoice?.tone,
              business_description: draft.orgInfo?.existingBusinessDescription,
            },
          }),
        });
        if (!settingsRes.ok) {
          const message = await readErrorMessage(settingsRes, "Failed to persist services");
          throw new Error(message);
        }
      }
    },
    [getScopedAccessToken],
  );

  const saveProgress = useCallback(async (payload: SavePayload) => {
    if (!hasSession) {
      throw new Error("Sign in to continue.");
    }
    setSavingProgress(true);
    setProgressError(null);
    try {
      const accessToken = await getScopedAccessToken();
      const res = await fetch("/api/onboarding/save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          ...payload,
          client_step: payload.client_step ?? currentStep,
          expected_email: resolvedInviteEmail ?? undefined,
        }),
      });
      if (!res.ok) {
        const message = await readErrorMessage(res, "Failed to save progress");
        throw new Error(message);
      }
      const saveResponse = (await res.json()) as SaveResponse;
      const pendingRecord = isRecord(saveResponse.pending) ? saveResponse.pending : null;
      const persistedStatus =
        typeof saveResponse.status === "string"
          ? saveResponse.status
          : typeof pendingRecord?.status === "string"
            ? pendingRecord.status
            : null;
      if (persistedStatus) {
        setOnboardingStatus((prev) =>
          (ONBOARDING_STATUS_RANK[persistedStatus] ?? -1) > (ONBOARDING_STATUS_RANK[prev] ?? -1)
            ? persistedStatus
            : prev,
        );
      }
      const pendingDraft = pendingRecord && isRecord(pendingRecord.onboarding_draft) ? pendingRecord.onboarding_draft : null;
      const persistedPasswordSetAt =
        typeof pendingRecord?.password_set_at === "string" && pendingRecord.password_set_at.trim()
          ? pendingRecord.password_set_at
          : typeof pendingDraft?.passwordSetAt === "string" && pendingDraft.passwordSetAt.trim()
            ? pendingDraft.passwordSetAt
            : null;
      if (persistedPasswordSetAt) {
        setPasswordSetAt(persistedPasswordSetAt);
      }
      const persistedResumeStep =
        normalizeStepIndex(saveResponse.resume_step)
        ?? (persistedStatus ? statusToResumeStep(persistedStatus) : null);
      if (persistedResumeStep !== null) {
        setCurrentStep((prev) => (persistedResumeStep > prev ? persistedResumeStep : prev));
      }
      const pendingTenantId =
        typeof pendingRecord?.tenant_id === "string" && pendingRecord.tenant_id.trim()
          ? pendingRecord.tenant_id.trim()
          : null;
      if (pendingTenantId) {
        setOrganizationId((prev) => pendingTenantId || prev);
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
  }, [buildOnboardingDraft, currentStep, getScopedAccessToken, hasSession, orgInfo.name, organizationId, persistOrganizationDraft, resolvedInviteEmail]);

  const startStripeCheckout = useCallback(async (tenantId: string) => {
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
    try {
      await saveProgress({
        business_name: companyName || "New client",
        first_name: orgInfo.firstName.trim(),
        last_name: orgInfo.lastName.trim(),
        status: "stripe_started",
        tenant_id: tenantId,
        onboarding_draft: buildOnboardingDraft(),
        agreement_signature: agreementSignature.trim() || undefined,
        agreement_accepted: agreementAccepted,
        agreement_signed_at: agreementAccepted && agreementSignature.trim() ? new Date().toISOString() : undefined,
        password_set: Boolean(passwordSetAt),
        password_set_at: passwordSetAt,
      });
      const response = await fetch(`${API_BASE_URL}/billing/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: userEmail,
          company_name: companyName || "New client",
          plan: "starter",
          tenant_id: tenantId,
          user_id: userStorageScope,
          success_path: "/onboarding?payment=success",
          cancel_path: "/onboarding?payment=canceled",
        }),
      });
      if (!response.ok) {
        const message = await readErrorMessage(response, "Unable to start Stripe checkout");
        throw new Error(message);
      }
      const payload = await response.json();
      const checkoutUrl = typeof payload?.checkout_url === "string" ? payload.checkout_url : null;
      if (!checkoutUrl) {
        throw new Error("Stripe checkout did not return a redirect URL");
      }
      if (typeof window !== "undefined") {
        window.location.assign(checkoutUrl);
      }
    } catch (error) {
      const message = normalizeClientError(error, "Unable to start Stripe checkout");
      setStripeError(message);
    } finally {
      setStripeLoading(false);
    }
  }, [
    agreementAccepted,
    agreementSignature,
    buildOnboardingDraft,
    orgInfo.firstName,
    orgInfo.lastName,
    orgInfo.name,
    passwordSetAt,
    saveProgress,
    userEmail,
    userStorageScope,
  ]);

  const refreshSession = useCallback(async () => {
    setCheckingSession(true);
    try {
      const token = await getScopedAccessToken();
      const { data, error } = await authClient.auth.getUser();
      if (error) {
        throw error;
      }
      const user = data.user;
      const verifiedPasswordSetAt = readSupabasePasswordSetAt(user);
      setHasSession(Boolean(token && user?.id));
      setUserEmail(user?.email ?? null);
      setUserStorageScope(user?.id ?? null);
      if (verifiedPasswordSetAt) {
        setPasswordSetAt((prev) => prev ?? verifiedPasswordSetAt);
      }
    } catch {
      setHasSession(false);
      setUserEmail(null);
      setUserStorageScope(null);
    } finally {
      setCheckingSession(false);
    }
  }, [authClient, getScopedAccessToken]);

  const handleSwitchAccount = useCallback(async () => {
    setSwitchingAccount(true);
    try {
      await authClient.auth.signOut({ scope: "local" });
      setHasSession(false);
      setUserEmail(null);
      setUserStorageScope(null);
      setPasswordSetAt(null);
      router.replace("/sign-in");
      router.refresh();
    } finally {
      setSwitchingAccount(false);
    }
  }, [authClient, router]);

  // When landing from a Supabase invite/magic link, exchange the token in the URL for a session
  // so we can read the user's email immediately.
  useEffect(() => {
    setAuthBootstrapComplete(false);
    if (typeof window === "undefined") {
      setAuthBootstrapComplete(true);
      return;
    }
    const bootstrapSession = async () => {
      try {
        // Hash params (/#access_token=...&refresh_token=...)
        const hash = window.location.hash;
        if (hash.includes("access_token")) {
          const params = new URLSearchParams(hash.slice(1));
          const access_token = params.get("access_token");
          const refresh_token = params.get("refresh_token");
          if (access_token && refresh_token) {
            await authClient.auth.setSession({ access_token, refresh_token });
            window.location.hash = "";
          }
        }

        // PKCE / code param (?code=...) from email link
        const code = new URLSearchParams(window.location.search).get("code");
        if (code) {
          await authClient.auth.exchangeCodeForSession(code);
        }
      } catch {
        // ignore; fall back to normal session check
      } finally {
        await refreshSession();
        setAuthBootstrapComplete(true);
      }
    };
    void bootstrapSession();
  }, [authClient, refreshSession]);

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
      const token = await getScopedAccessToken();
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
          name: orgInfo.name.trim() || userEmail?.split("@")[0] || "New client",
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
    if (connectingGoogle) {
      return;
    }
    let resolvedOrganizationId = organizationId;
    if (!resolvedOrganizationId) {
      try {
        resolvedOrganizationId = await createOrganization();
      } catch {
        setConnectError("Create the organization first.");
        return;
      }
    }
    setConnectError(null);
    setConnectingGoogle(true);
    try {
      const token = await getScopedAccessToken();
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
          organization_id: resolvedOrganizationId,
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

  const applyImportedBusinessFromGoogleLocation = useCallback((location: GoogleLocationOption) => {
    const metadata = location.metadata;
    if (!metadata) {
      return;
    }
    const importedKeys = new Set<string>();
    const title = typeof metadata.title === "string" ? metadata.title.trim() : "";
    const website =
      typeof metadata.websiteUri === "string"
        ? metadata.websiteUri.trim()
        : typeof metadata.website === "string"
          ? metadata.website.trim()
          : "";
    const phoneNumbers = isRecord(metadata.phoneNumbers) ? metadata.phoneNumbers : null;
    const phone =
      phoneNumbers && typeof phoneNumbers.primaryPhone === "string"
        ? phoneNumbers.primaryPhone.trim()
        : typeof metadata.primaryPhone === "string"
          ? metadata.primaryPhone.trim()
          : "";
    const profile = isRecord(metadata.profile) ? metadata.profile : null;
    const businessDescription =
      profile && typeof profile.description === "string"
        ? profile.description.trim()
        : typeof metadata.description === "string"
          ? metadata.description.trim()
          : "";
    const categories = isRecord(metadata.categories) ? metadata.categories : null;
    const primaryCategoryRaw = categories && isRecord(categories.primaryCategory)
      ? categories.primaryCategory
      : null;
    const primaryCategory =
      primaryCategoryRaw && typeof primaryCategoryRaw.displayName === "string"
        ? primaryCategoryRaw.displayName.trim()
        : "";

    const storefrontAddress = isRecord(metadata.storefrontAddress)
      ? metadata.storefrontAddress
      : isRecord(metadata.address)
        ? metadata.address
        : null;
    const city =
      storefrontAddress && typeof storefrontAddress.locality === "string"
        ? storefrontAddress.locality.trim()
        : storefrontAddress && typeof storefrontAddress.city === "string"
          ? storefrontAddress.city.trim()
          : "";
    const state =
      storefrontAddress && typeof storefrontAddress.administrativeArea === "string"
        ? storefrontAddress.administrativeArea.trim()
        : storefrontAddress && typeof storefrontAddress.regionCode === "string"
          ? storefrontAddress.regionCode.trim()
          : "";
    const addressLines = storefrontAddress && Array.isArray(storefrontAddress.addressLines)
      ? storefrontAddress.addressLines.filter((line): line is string => typeof line === "string" && Boolean(line.trim()))
      : [];
    const addressOrServiceArea = [
      ...addressLines,
      city,
      state,
      storefrontAddress && typeof storefrontAddress.postalCode === "string" ? storefrontAddress.postalCode.trim() : "",
    ].filter(Boolean).join(", ");

    const secondaryLocations: LocationInput[] = [];
    const serviceArea = isRecord(metadata.serviceArea) ? metadata.serviceArea : null;
    const placeInfos = serviceArea && isRecord(serviceArea.places) && Array.isArray(serviceArea.places.placeInfos)
      ? serviceArea.places.placeInfos
      : [];
    for (const place of placeInfos) {
      if (!isRecord(place) || typeof place.placeName !== "string") continue;
      const parsed = parseLocationText(place.placeName);
      if (parsed.city || parsed.state) secondaryLocations.push(parsed);
    }

    if (title) importedKeys.add("name");
    if (website) importedKeys.add("websiteText");
    if (phone) importedKeys.add("phone");
    if (addressOrServiceArea) importedKeys.add("addressOrServiceArea");
    if (businessDescription) importedKeys.add("existingBusinessDescription");
    if (primaryCategory) importedKeys.add("primaryCategory");
    if (city) importedKeys.add("primaryLocationCity");
    if (state) importedKeys.add("primaryLocationState");
    if (secondaryLocations.length > 0) importedKeys.add("secondaryLocations");

    setImportedBusinessFields((prev) => Array.from(new Set([...prev, ...importedKeys])));
    setOrgInfo((prev) => ({
      ...prev,
      name: title || prev.name,
      phone: phone || prev.phone,
      addressOrServiceArea: addressOrServiceArea || prev.addressOrServiceArea,
      primaryCategory: primaryCategory || prev.primaryCategory,
      primaryLocationCity: city || prev.primaryLocationCity,
      primaryLocationState: state || prev.primaryLocationState,
      existingBusinessDescription: businessDescription || prev.existingBusinessDescription,
      secondaryLocations:
        secondaryLocations.length > 0
          ? normalizeSecondaryLocations(secondaryLocations)
          : prev.secondaryLocations,
    }));
    if (website) {
      setBrandVoice((prev) => ({ ...prev, websiteText: website }));
    }

    const serviceNames = new Set<string>();
    if (primaryCategory) {
      serviceNames.add(primaryCategory);
    }
    const additionalCategories = categories && Array.isArray(categories.additionalCategories)
      ? categories.additionalCategories
      : [];
    for (const category of additionalCategories) {
      if (!isRecord(category) || typeof category.displayName !== "string") continue;
      const normalized = category.displayName.trim();
      if (normalized) serviceNames.add(normalized);
    }
    if (Array.isArray(metadata.serviceItems)) {
      for (const item of metadata.serviceItems) {
        if (!isRecord(item)) continue;
        if (typeof item.name === "string" && item.name.trim()) {
          serviceNames.add(item.name.trim());
        }
      }
    }
    if (serviceNames.size > 0) {
      setServices((prev) => {
        const seen = new Set(prev.map((service) => service.name.trim().toLowerCase()).filter(Boolean));
        const next = [...prev];
        for (const serviceName of serviceNames) {
          const key = serviceName.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          next.push({ name: serviceName, description: "", source: "imported" });
        }
        return next;
      });
    }
  }, []);

  const loadGoogleAccounts = useCallback(async () => {
    if (!organizationId) return;
    const token = await getScopedAccessToken();
    if (!token) return;
    setLoadingGoogleAccounts(true);
    setConnectError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/google/accounts?organization_id=${organizationId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        const message = await readErrorMessage(response, "Unable to load Google accounts");
        throw new Error(message);
      }
      const payload = (await response.json()) as Array<Record<string, unknown>>;
      const accounts: GoogleAccountOption[] = payload
        .map((account) => {
          const id = typeof account.id === "string" ? account.id : "";
          if (!id) return null;
          return {
            id,
            displayName:
              typeof account.display_name === "string" && account.display_name.trim()
                ? account.display_name.trim()
                : typeof account.external_account_id === "string"
                  ? account.external_account_id
                  : "Google account",
            externalAccountId:
              typeof account.external_account_id === "string" ? account.external_account_id : null,
          };
        })
        .filter((entry): entry is GoogleAccountOption => Boolean(entry));
      setGoogleAccounts(accounts);
      if (accounts.length > 0) {
        setSelectedGoogleAccountId((prev) => prev && accounts.some((account) => account.id === prev) ? prev : accounts[0].id);
      }
    } catch (error) {
      setConnectError(normalizeClientError(error, "Unable to load Google accounts"));
    } finally {
      setLoadingGoogleAccounts(false);
    }
  }, [getScopedAccessToken, organizationId]);

  const loadGoogleLocations = useCallback(async (accountId: string) => {
    if (!accountId) return;
    const token = await getScopedAccessToken();
    if (!token) return;
    setLoadingGoogleLocations(true);
    setConnectError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/google/accounts/${accountId}/locations`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        const message = await readErrorMessage(response, "Unable to load Google Business Profile locations");
        throw new Error(message);
      }
      const payload = (await response.json()) as Array<Record<string, unknown>>;
      const locations: GoogleLocationOption[] = payload
        .map((location) => {
          const name = typeof location.name === "string" ? location.name : "";
          if (!name) return null;
          return {
            name,
            title: typeof location.title === "string" ? location.title : null,
            storeCode: typeof location.store_code === "string" ? location.store_code : null,
            metadata: isRecord(location.metadata) ? location.metadata : null,
          };
        })
        .filter((entry): entry is GoogleLocationOption => Boolean(entry));
      setGoogleLocations(locations);
      if (locations.length > 0) {
        setSelectedGoogleLocationName((prev) => prev && locations.some((location) => location.name === prev) ? prev : locations[0].name);
      }
    } catch (error) {
      setConnectError(normalizeClientError(error, "Unable to load Google locations"));
    } finally {
      setLoadingGoogleLocations(false);
    }
  }, [getScopedAccessToken]);

  const handleSelectGoogleLocation = useCallback(async () => {
    if (!organizationId || !selectedGoogleAccountId || !selectedGoogleLocationName) {
      setConnectError("Select a Google account and location first.");
      return;
    }
    const token = await getScopedAccessToken();
    if (!token) {
      setConnectError("Sign in to continue.");
      return;
    }
    setConnectingGoogleLocation(true);
    setConnectError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/google/accounts/${selectedGoogleAccountId}/locations/connect`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          organization_id: organizationId,
          location_name: selectedGoogleLocationName,
        }),
      });
      if (!response.ok) {
        const message = await readErrorMessage(response, "Unable to connect selected Google Business Profile");
        throw new Error(message);
      }
      const connected = (await response.json()) as { id?: string };
      const account = googleAccounts.find((entry) => entry.id === selectedGoogleAccountId) ?? null;
      const location = googleLocations.find((entry) => entry.name === selectedGoogleLocationName) ?? null;
      const selected: SelectedGoogleLocation = {
        accountId: selectedGoogleAccountId,
        accountName: account?.displayName ?? null,
        locationName: selectedGoogleLocationName,
        locationTitle: location?.title ?? null,
        connectedLocationId: typeof connected.id === "string" ? connected.id : null,
        metadata: location?.metadata ?? null,
      };
      setSelectedGoogleLocation(selected);
      setGoogleConnected(true);
      if (location) {
        applyImportedBusinessFromGoogleLocation(location);
      }
      const googleDraft: OnboardingDraftState = {
        ...buildOnboardingDraft({ googleConnected: true }),
        selectedGoogleAccountId,
        selectedGoogleLocationName,
        selectedGoogleLocation: selected,
        googleConnected: true,
      };
      await saveProgress({
        first_name: orgInfo.firstName.trim(),
        last_name: orgInfo.lastName.trim(),
        tenant_id: organizationId,
        status: "in_progress",
        onboarding_draft: googleDraft,
      });
    } catch (error) {
      setConnectError(normalizeClientError(error, "Unable to connect selected Google location"));
    } finally {
      setConnectingGoogleLocation(false);
    }
  }, [
    applyImportedBusinessFromGoogleLocation,
    buildOnboardingDraft,
    googleAccounts,
    googleLocations,
    orgInfo.firstName,
    orgInfo.lastName,
    organizationId,
    saveProgress,
    selectedGoogleAccountId,
    selectedGoogleLocationName,
    getScopedAccessToken,
  ]);

  const generateServiceDescription = useCallback(async (serviceName: string) => {
    const response = await fetch("/api/onboarding/services/generate-description", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        service_name: serviceName,
        business_name: orgInfo.name,
        primary_category: orgInfo.primaryCategory,
        city: orgInfo.primaryLocationCity,
        state: orgInfo.primaryLocationState,
        tone: brandVoice.tone,
      }),
    });
    if (!response.ok) {
      const message = await readErrorMessage(response, "Unable to generate description");
      throw new Error(message);
    }
    const payload = (await response.json()) as { description?: unknown };
    if (typeof payload.description !== "string" || !payload.description.trim()) {
      throw new Error("AI returned an empty description");
    }
    return payload.description.trim();
  }, [
    brandVoice.tone,
    orgInfo.name,
    orgInfo.primaryCategory,
    orgInfo.primaryLocationCity,
    orgInfo.primaryLocationState,
  ]);

  const handleGenerateServiceDescription = useCallback(async (index: number) => {
    const target = services[index];
    if (!target || !target.name.trim()) {
      setServiceGenerationError("Enter a service name before generating a description.");
      return;
    }
    setGeneratingServiceIndex(index);
    setServiceGenerationError(null);
    try {
      const generated = await generateServiceDescription(target.name.trim());
      setServices((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], description: generated, source: "ai" };
        return next;
      });
    } catch (error) {
      setServiceGenerationError(normalizeClientError(error, "Unable to generate service description"));
    } finally {
      setGeneratingServiceIndex(null);
    }
  }, [generateServiceDescription, services]);

  useEffect(() => {
    if (!organizationId || !hasSession || currentStep !== 0) {
      return;
    }
    void loadGoogleAccounts();
  }, [currentStep, hasSession, loadGoogleAccounts, organizationId]);

  useEffect(() => {
    if (!organizationId || !hasSession || oauthStatusFromQuery !== "google_connected") {
      return;
    }
    void loadGoogleAccounts();
  }, [hasSession, loadGoogleAccounts, oauthStatusFromQuery, organizationId]);

  useEffect(() => {
    if (!selectedGoogleAccountId) {
      setGoogleLocations([]);
      setSelectedGoogleLocationName(null);
      return;
    }
    void loadGoogleLocations(selectedGoogleAccountId);
  }, [loadGoogleLocations, selectedGoogleAccountId]);

  const statusForStep = (step: number) => {
    switch (step) {
      case 0:
        return "business_setup";
      case 1:
        return "stripe_pending";
      default:
        return "in_progress";
    }
  };

  const goNext = async (
    overrides?: { googleConnected?: boolean },
  ) => {
    let resolvedTenantId = organizationId;
    const nextStatus = statusForStep(currentStep);
    if (!resolvedTenantId) {
      try {
        resolvedTenantId = await createOrganization();
      } catch {
        return;
      }
    }

    try {
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
    } catch {
      return;
    }

    if (currentStep < steps.length) {
      setOnboardingStatus((prev) =>
        (ONBOARDING_STATUS_RANK[nextStatus] ?? -1) > (ONBOARDING_STATUS_RANK[prev] ?? -1) ? nextStatus : prev,
      );
    }

    if (currentStep < steps.length - 1) {
      setCurrentStep((step) => (step > currentStep ? step : step + 1));
    }
  };

  const goBack = () => {
    if (currentStep > 0) {
      setCurrentStep((step) => step - 1);
    }
  };

  const handleContinue = async () => {
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
        if (!organizationId) {
          setStripeError("Onboarding is missing a tenant. Refresh and try again.");
          return;
        }
        await startStripeCheckout(organizationId);
        return;
      }
      if (typeof window !== "undefined") {
        window.location.reload();
      } else {
        router.refresh();
      }
      return;
    }
    await goNext();
  };

  const fieldOriginMeta = (fieldKey: string, value: string) => {
    if (!value.trim()) {
      return {
        label: "Missing",
        className: "bg-rose-50 text-rose-700",
      };
    }
    if (importedBusinessFields.includes(fieldKey)) {
      return {
        label: "Imported from GBP",
        className: "bg-emerald-50 text-emerald-700",
      };
    }
    return {
      label: "Added manually",
      className: "bg-slate-100 text-slate-700",
    };
  };

  if (loadingClaimStatus) {
    return <div className="min-h-screen px-6 py-12 text-center text-slate-600">Checking onboarding status…</div>;
  }

  if (claimErrorCode === "invite_email_mismatch") {
    const signedInEmail = inviteMismatch?.signedInEmail ?? userEmail ?? "another account";
    const inviteEmail = inviteMismatch?.inviteEmail ?? resolvedInviteEmail ?? "the invited account";

    return (
      <div className="min-h-screen bg-slate-50 px-6 py-12">
        <div className="mx-auto max-w-2xl space-y-6 rounded-3xl bg-white p-8 text-center shadow-sm">
          <p className="text-xs uppercase tracking-[0.3em] text-primary">Wrong Account</p>
          <h1 className="text-3xl font-semibold">This invite belongs to a different email</h1>
          <p className="text-sm text-slate-600">
            Signed in as <span className="font-semibold text-slate-800">{signedInEmail}</span>, but this invite is for{" "}
            <span className="font-semibold text-slate-800">{inviteEmail}</span>.
          </p>
          <p className="text-sm text-slate-600">
            Sign out, then open the invite link again from the correct inbox.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              className="rounded-full bg-primary px-6 py-3 text-sm font-semibold text-white disabled:opacity-60"
              onClick={() => void handleSwitchAccount()}
              disabled={switchingAccount}
            >
              {switchingAccount ? "Signing out..." : "Sign out and switch account"}
            </button>
            <button
              className="rounded-full border border-slate-200 px-6 py-3 text-sm font-semibold text-slate-700"
              onClick={() => {
                void refreshSession();
              }}
            >
              Refresh session
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (claimErrorCode === "invite_required" || claimErrorCode === "invite_canceled") {
    return (
      <div className="min-h-screen bg-slate-50 px-6 py-12">
        <div className="mx-auto max-w-2xl space-y-6 rounded-3xl bg-white p-8 text-center shadow-sm">
          <p className="text-xs uppercase tracking-[0.3em] text-primary">Onboarding Link</p>
          <h1 className="text-3xl font-semibold">This onboarding link is not active</h1>
          <p className="text-sm text-slate-600">
            {tokenError ?? "Sign in to start onboarding, or ask an admin to send you a valid onboarding invite link."}
          </p>
          <button
            className="inline-block rounded-full bg-primary px-6 py-3 text-sm font-semibold text-white"
            onClick={() => {
              router.replace("/sign-in");
              router.refresh();
            }}
          >
            Go to sign in
          </button>
        </div>
      </div>
    );
  }

  if (!hasSession && !checkingSession && !hasInviteContext) {
    return (
      <div className="min-h-screen bg-slate-50 px-6 py-12">
        <div className="mx-auto max-w-2xl space-y-6 rounded-3xl bg-white p-8 text-center shadow-sm">
          <p className="text-xs uppercase tracking-[0.3em] text-primary">Sign In Required</p>
          <h1 className="text-3xl font-semibold">Sign in to start onboarding</h1>
          <p className="text-sm text-slate-600">
            Sign in with the Google account you want to use for Map Pack 3. You can also use an invite link if an admin sent one.
          </p>
          <button
            className="inline-block rounded-full bg-primary px-6 py-3 text-sm font-semibold text-white"
            onClick={() => {
              router.replace("/sign-in");
              router.refresh();
            }}
          >
            Go to sign in
          </button>
        </div>
      </div>
    );
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
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-semibold">Google login + profile</h2>
                <p className="text-sm text-slate-600">
                  Confirm your name, connect Google, and choose the exact Business Profile location to use.
                </p>
              </div>
              <p className="text-sm font-semibold text-slate-800">
                Signed in as <span className="text-primary">{userEmail ?? "Loading…"}</span>
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className="text-slate-600">First name</span>
                  <input
                    className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2"
                    placeholder="Alex"
                    value={orgInfo.firstName}
                    onChange={(event) => setOrgInfo((prev) => ({ ...prev, firstName: event.target.value }))}
                  />
                </label>
                <label className="block">
                  <span className="text-slate-600">Last name</span>
                  <input
                    className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2"
                    placeholder="Reyes"
                    value={orgInfo.lastName}
                    onChange={(event) => setOrgInfo((prev) => ({ ...prev, lastName: event.target.value }))}
                  />
                </label>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                    onClick={() => {
                      void handleConnectGoogle();
                    }}
                    disabled={connectingGoogle || creatingOrg || !hasSession}
                  >
                    {connectingGoogle ? "Redirecting to Google…" : "Connect Google Business Profile"}
                  </button>
                  <button
                    className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-60"
                    onClick={() => {
                      void loadGoogleAccounts();
                    }}
                    disabled={loadingGoogleAccounts || !organizationId}
                  >
                    {loadingGoogleAccounts ? "Refreshing accounts…" : "Refresh Google accounts"}
                  </button>
                </div>

                {googleAccounts.length > 0 && (
                  <label className="mt-4 block text-sm">
                    <span className="text-slate-600">Google account</span>
                    <select
                      className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2"
                      value={selectedGoogleAccountId ?? ""}
                      onChange={(event) => setSelectedGoogleAccountId(event.target.value || null)}
                    >
                      {googleAccounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.displayName}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {!loadingGoogleAccounts && organizationId && googleAccounts.length === 0 && oauthStatusFromQuery === "google_connected" && (
                  <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                    Google connected successfully, but no Google Business Profile accounts were returned. Confirm this Google account has owner or manager access to a Business Profile, then refresh accounts.
                  </div>
                )}

                {loadingGoogleLocations && (
                  <p className="mt-3 text-sm text-slate-600">Loading Business Profile locations…</p>
                )}

                {!loadingGoogleLocations && selectedGoogleAccountId && googleLocations.length === 0 && (
                  <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                    No Google Business Profile locations were returned for this Google account. Choose another account or create/claim a Business Profile in Google before continuing.
                  </div>
                )}

                {googleLocations.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <p className="text-sm font-medium text-slate-700">Choose your primary GBP location</p>
                    {googleLocations.map((location) => (
                      <label
                        key={location.name}
                        className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${
                          selectedGoogleLocationName === location.name ? "border-primary bg-primary/5" : "border-slate-200"
                        }`}
                      >
                        <input
                          type="radio"
                          name="selected-google-location"
                          className="mt-1"
                          checked={selectedGoogleLocationName === location.name}
                          onChange={() => setSelectedGoogleLocationName(location.name)}
                        />
                        <span className="text-sm text-slate-700">
                          <span className="block font-semibold">{location.title ?? location.name}</span>
                          {location.storeCode && (
                            <span className="text-xs text-slate-500">Store code: {location.storeCode}</span>
                          )}
                        </span>
                      </label>
                    ))}
                    <button
                      className="mt-3 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-60"
                      onClick={() => {
                        void handleSelectGoogleLocation();
                      }}
                      disabled={
                        connectingGoogleLocation ||
                        !selectedGoogleAccountId ||
                        !selectedGoogleLocationName
                      }
                    >
                      {connectingGoogleLocation ? "Connecting selected location…" : "Use selected location"}
                    </button>
                  </div>
                )}

                {googleConnected && selectedGoogleLocation && (
                  <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                    Connected: <span className="font-semibold">{selectedGoogleLocation.locationTitle ?? selectedGoogleLocation.locationName}</span>
                    {selectedGoogleLocation.accountName ? ` (${selectedGoogleLocation.accountName})` : ""}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <span className={`h-2 w-2 rounded-full ${hasSession ? "bg-emerald-500" : "bg-amber-500"}`} />
                <span>
                  {checkingSession
                    ? "Checking session..."
                    : hasSession
                      ? "Session ready."
                      : "No active session found. Open the invite link and sign in again."}
                </span>
              </div>
              {connectError && <p className="text-sm text-rose-600">{connectError}</p>}
              {createOrgError && <p className="text-sm text-rose-600">{createOrgError}</p>}
            </div>
          )}

          {currentStep === 1 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-semibold">Confirm business info + brand voice</h2>
                <p className="text-sm text-slate-600">
                  We imported what we could from Google Business Profile. Fill any missing required fields before continuing.
                </p>
              </div>
              {missingBusinessFields.length > 0 && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  Missing required fields: {missingBusinessFields.join(", ")}
                </div>
              )}
              <div className="grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className="flex items-center justify-between text-slate-600">
                    <span>Company name</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${fieldOriginMeta("name", orgInfo.name).className}`}>
                      {fieldOriginMeta("name", orgInfo.name).label}
                    </span>
                  </span>
                  <input
                    className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2"
                    placeholder="Acme HVAC"
                    value={orgInfo.name}
                    onChange={(event) => setOrgInfo((prev) => ({ ...prev, name: event.target.value }))}
                  />
                </label>
                <label className="block">
                  <span className="flex items-center justify-between text-slate-600">
                    <span>Primary category / business type</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${fieldOriginMeta("primaryCategory", orgInfo.primaryCategory).className}`}>
                      {fieldOriginMeta("primaryCategory", orgInfo.primaryCategory).label}
                    </span>
                  </span>
                  <input
                    className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2"
                    placeholder="HVAC contractor"
                    value={orgInfo.primaryCategory}
                    onChange={(event) => setOrgInfo((prev) => ({ ...prev, primaryCategory: event.target.value }))}
                  />
                </label>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className="flex items-center justify-between text-slate-600">
                    <span>Business address or service area</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${fieldOriginMeta("addressOrServiceArea", orgInfo.addressOrServiceArea).className}`}>
                      {fieldOriginMeta("addressOrServiceArea", orgInfo.addressOrServiceArea).label}
                    </span>
                  </span>
                  <input
                    className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2"
                    placeholder="123 Main St, Austin, TX or Austin metro"
                    value={orgInfo.addressOrServiceArea}
                    onChange={(event) => setOrgInfo((prev) => ({ ...prev, addressOrServiceArea: event.target.value }))}
                  />
                </label>
                <label className="block">
                  <span className="flex items-center justify-between text-slate-600">
                    <span>Phone number</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${fieldOriginMeta("phone", orgInfo.phone).className}`}>
                      {fieldOriginMeta("phone", orgInfo.phone).label}
                    </span>
                  </span>
                  <input
                    className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2"
                    placeholder="(555) 123-4567"
                    value={orgInfo.phone}
                    onChange={(event) => setOrgInfo((prev) => ({ ...prev, phone: event.target.value }))}
                  />
                </label>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className="text-slate-600">Contact name</span>
                  <input
                    className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2"
                    placeholder="Alex Reyes"
                    value={orgInfo.contactName}
                    onChange={(event) => setOrgInfo((prev) => ({ ...prev, contactName: event.target.value }))}
                  />
                </label>
                <label className="block">
                  <span className="text-slate-600">Contact email</span>
                  <input
                    type="email"
                    className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2"
                    placeholder="owner@example.com"
                    value={orgInfo.contactEmail}
                    onChange={(event) => setOrgInfo((prev) => ({ ...prev, contactEmail: event.target.value }))}
                  />
                </label>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className="flex items-center justify-between text-slate-600">
                    <span>Primary location city</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${fieldOriginMeta("primaryLocationCity", orgInfo.primaryLocationCity).className}`}>
                      {fieldOriginMeta("primaryLocationCity", orgInfo.primaryLocationCity).label}
                    </span>
                  </span>
                  <input
                    className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2"
                    placeholder="Austin"
                    value={orgInfo.primaryLocationCity}
                    onChange={(event) => setOrgInfo((prev) => ({ ...prev, primaryLocationCity: event.target.value }))}
                  />
                </label>
                <label className="block">
                  <span className="flex items-center justify-between text-slate-600">
                    <span>Primary location state</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${fieldOriginMeta("primaryLocationState", orgInfo.primaryLocationState).className}`}>
                      {fieldOriginMeta("primaryLocationState", orgInfo.primaryLocationState).label}
                    </span>
                  </span>
                  <input
                    className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2"
                    placeholder="TX"
                    value={orgInfo.primaryLocationState}
                    onChange={(event) => setOrgInfo((prev) => ({ ...prev, primaryLocationState: event.target.value }))}
                  />
                </label>
              </div>

              <div className="space-y-2 rounded-2xl border border-slate-200 p-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-700">
                    Service locations ({orgInfo.secondaryLocations.length}/{MAX_SECONDARY_LOCATIONS})
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
                {orgInfo.secondaryLocations.map((value, index) => (
                  <div key={`secondary-${index}`} className="grid gap-2 md:grid-cols-2">
                    <input
                      className="w-full rounded-2xl border border-slate-200 px-3 py-2"
                      placeholder={`City ${index + 1}`}
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
                      placeholder={`State ${index + 1}`}
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

              <label className="block">
                <span className="flex items-center justify-between text-slate-600">
                  <span>Website</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${fieldOriginMeta("websiteText", brandVoice.websiteText).className}`}>
                    {fieldOriginMeta("websiteText", brandVoice.websiteText).label}
                  </span>
                </span>
                <input
                  type="url"
                  className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2"
                  placeholder="https://www.yourbusiness.com"
                  value={brandVoice.websiteText}
                  onChange={(event) => setBrandVoice((prev) => ({ ...prev, websiteText: event.target.value }))}
                />
              </label>

              <label className="block">
                <span className="flex items-center justify-between text-slate-600">
                  <span>Existing business description</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${fieldOriginMeta("existingBusinessDescription", orgInfo.existingBusinessDescription).className}`}>
                    {fieldOriginMeta("existingBusinessDescription", orgInfo.existingBusinessDescription).label}
                  </span>
                </span>
                <textarea
                  className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2"
                  rows={3}
                  placeholder="Paste or edit the current GBP/website business description if you have one."
                  value={orgInfo.existingBusinessDescription}
                  onChange={(event) => setOrgInfo((prev) => ({ ...prev, existingBusinessDescription: event.target.value }))}
                />
              </label>

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
              </div>
              {businessSetupSaved && (
                <p className="text-xs text-emerald-600">
                  Saved for organization <span className="font-mono">{organizationId}</span>
                </p>
              )}
            </div>
          )}

          {currentStep === 1 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-semibold">Confirm services + descriptions</h2>
                <p className="text-sm text-slate-600">
                  Imported services are editable. Add, remove, or update anything before final checkout.
                </p>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-600">Services with names: {namedServicesCount}</p>
                <button
                  type="button"
                  className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700"
                  onClick={() => {
                    setServices((prev) =>
                      prev.length >= MAX_SERVICE_ROWS
                        ? prev
                        : [...prev, { name: "", description: "", source: "manual" }],
                    );
                    setServiceError(null);
                  }}
                  disabled={services.length >= MAX_SERVICE_ROWS}
                >
                  + Add service
                </button>
              </div>
              {services.length === 0 && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  No services imported from GBP. Add at least one service to continue.
                </div>
              )}
              {serviceError && <p className="text-sm text-rose-600">{serviceError}</p>}
              {serviceGenerationError && <p className="text-sm text-rose-600">{serviceGenerationError}</p>}
              <div className="space-y-3">
                {services.map((service, index) => {
                  const missingDescription = service.name.trim() && !service.description.trim();
                  return (
                    <div key={`service-${index}`} className="rounded-2xl border border-slate-200 p-4">
                      <div className="grid gap-3 md:grid-cols-[1fr,auto]">
                        <label className="block">
                          <span className="text-sm text-slate-600">Service name</span>
                          <input
                            className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2"
                            placeholder={`Service ${index + 1}`}
                            value={service.name}
                            onChange={(event) => {
                              const nextName = event.target.value;
                              setServices((prev) => {
                                const next = [...prev];
                                next[index] = { ...next[index], name: nextName };
                                return next;
                              });
                            }}
                          />
                        </label>
                        <button
                          type="button"
                          className="self-end rounded-full border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700"
                          onClick={() => {
                            setServices((prev) => prev.filter((_, rowIndex) => rowIndex !== index));
                          }}
                        >
                          Remove
                        </button>
                      </div>
                      <label className="mt-3 block">
                        <span className="text-sm text-slate-600">Description</span>
                        <textarea
                          className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2"
                          rows={3}
                          placeholder="Add a concise, professional description for this service."
                          value={service.description}
                          onChange={(event) => {
                            const nextDescription = event.target.value;
                            setServices((prev) => {
                              const next = [...prev];
                              next[index] = {
                                ...next[index],
                                description: nextDescription,
                                source: next[index].source === "imported" ? "manual" : next[index].source,
                              };
                              return next;
                            });
                          }}
                        />
                      </label>
                      {missingDescription && (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <span className="text-xs text-amber-700">Description missing.</span>
                          <button
                            type="button"
                            className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 disabled:opacity-60"
                            onClick={() => {
                              void handleGenerateServiceDescription(index);
                            }}
                            disabled={generatingServiceIndex === index || !service.name.trim()}
                          >
                            {generatingServiceIndex === index ? "Generating…" : "AI generate"}
                          </button>
                          <span className="text-xs text-slate-500">Or write manually in the field above.</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {servicesMissingDescriptions.length > 0 && (
                <p className="text-sm text-amber-700">
                  {servicesMissingDescriptions.length} service description
                  {servicesMissingDescriptions.length === 1 ? "" : "s"} still missing.
                </p>
              )}
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">Stripe payment (final step)</h2>
              <p className="text-sm text-slate-600">
                You are signing up for the Map Pack 3 service plan at <span className="font-semibold">$5/month</span>.
              </p>
              <p className="text-sm text-slate-600">Sign the agreement, continue to Stripe Checkout, then return here after payment is confirmed.</p>
              {stripeError && <p className="text-sm text-rose-600">{stripeError}</p>}
              {stripeLoading ? (
                <p className="text-sm text-slate-600">Opening Stripe Checkout…</p>
              ) : stripeStarted ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                  Stripe Checkout has started. After payment completes, dashboard access unlocks when the webhook confirms an active subscription.
                </div>
              ) : (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                  Stripe Checkout will open after you accept the billing terms.
                </div>
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
                <span className={`h-2 w-2 rounded-full ${stripeStarted ? "bg-amber-500" : "bg-slate-400"}`} />
                <span>{stripeStarted ? "Waiting for webhook confirmation" : "Awaiting payment"}</span>
              </div>
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
          <button
            className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
            onClick={() => {
              void handleContinue();
            }}
            disabled={
              nextDisabled ||
              creatingOrg ||
              savingProgress ||
              connectingGoogleLocation ||
              (currentStep === 2 && stripeLoading)
            }
          >
            {currentStep === 2
              ? stripeStarted
                  ? "Check payment status"
                  : stripeLoading
                    ? "Opening Stripe…"
                    : "Continue to Stripe"
              : savingProgress
                ? "Saving…"
                : creatingOrg && currentStep === 0
                  ? "Preparing…"
                  : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}

export type PostLoginRole = "owner_admin" | "client" | "invalid";

export type PostLoginResolution = {
  role: PostLoginRole;
  tenantId: string | null;
  destination: string;
  onboardingComplete: boolean;
  nextStep: string | null;
  diagnostics: Record<string, unknown> | null;
};

const VALID_STEPS = new Set([
  "google_profile",
  "business_info",
  "services",
  "stripe",
  "done",
  // Legacy steps (kept for backward compatibility with older DB state)
  "account",
  "business_setup",
  "billing",
  "google",
  "finish",
]);

const STEP_ALIAS: Record<string, string> = {
  account: "google_profile",
  business_setup: "business_info",
  billing: "services",
  google: "stripe",
  finish: "stripe",
};

const DEFAULT_RESOLUTION: PostLoginResolution = {
  role: "invalid",
  tenantId: null,
  destination: "/sign-in?error=invalid_role",
  onboardingComplete: false,
  nextStep: "google_profile",
  diagnostics: null,
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const asString = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : null;

const asBoolean = (value: unknown): boolean | null => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return null;
};

export const isSafeLocalRedirect = (value: string | null | undefined): value is string =>
  Boolean(value && value.startsWith("/") && !value.startsWith("//"));

export const firstRpcRow = (rpcData: unknown): unknown => {
  if (Array.isArray(rpcData)) {
    return rpcData[0] ?? null;
  }
  return rpcData;
};

export const normalizePostLoginResolution = (rpcData: unknown): PostLoginResolution => {
  const row = asRecord(firstRpcRow(rpcData));
  if (!row) return { ...DEFAULT_RESOLUTION };

  const roleRaw = asString(row.role)?.toLowerCase();
  const role: PostLoginRole = roleRaw === "owner_admin" || roleRaw === "client" ? roleRaw : "invalid";

  const tenantId = asString(row.tenant_id);
  const onboardingComplete = asBoolean(row.onboarding_complete) ?? false;

  let nextStep = asString(row.next_step)?.toLowerCase() ?? null;
  if (nextStep && STEP_ALIAS[nextStep]) {
    nextStep = STEP_ALIAS[nextStep];
  }
  if (nextStep && !VALID_STEPS.has(nextStep)) {
    nextStep = "google_profile";
  }

  const diagnostics = asRecord(row.diagnostics);

  let destination = asString(row.destination) ?? DEFAULT_RESOLUTION.destination;
  if (!destination.startsWith("/")) {
    destination = DEFAULT_RESOLUTION.destination;
  }

  if (role === "owner_admin") {
    destination = "/admin";
  }

  if (role === "client") {
    if (onboardingComplete) {
      destination = "/dashboard";
      nextStep = "done";
    } else if (!destination.startsWith("/onboarding")) {
      destination = `/onboarding?step=${nextStep ?? "google_profile"}`;
    }
  }

  if (role === "invalid") {
    destination = DEFAULT_RESOLUTION.destination;
  }

  return {
    role,
    tenantId,
    destination,
    onboardingComplete,
    nextStep,
    diagnostics,
  };
};

export const resolveClientAppDestination = (
  resolution: PostLoginResolution,
  requestedRedirect?: string | null,
): string => {
  if (resolution.role !== "client") {
    return DEFAULT_RESOLUTION.destination;
  }

  if (!resolution.onboardingComplete) {
    return resolution.destination.startsWith("/onboarding")
      ? resolution.destination
      : `/onboarding?step=${resolution.nextStep ?? "google_profile"}`;
  }

  if (isSafeLocalRedirect(requestedRedirect)) {
    return requestedRedirect;
  }

  return "/dashboard";
};

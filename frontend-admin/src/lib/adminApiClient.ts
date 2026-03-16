type FetchOptions = { method?: "GET" | "POST" | "PATCH"; body?: unknown; searchParams?: Record<string, string | number | undefined> };

async function apiFetch<T>(path: string, { method = "GET", body, searchParams }: FetchOptions = {}): Promise<T> {
  const url = new URL(path, typeof window === "undefined" ? "http://localhost" : window.location.origin);
  if (searchParams) {
    Object.entries(searchParams).forEach(([key, value]) => {
      if (value !== undefined) url.searchParams.set(key, String(value));
    });
  }
  const res = await fetch(url.toString(), {
    method,
    headers: {
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    if (text) {
      try {
        const parsed = JSON.parse(text) as { error?: unknown; message?: unknown };
        const message =
          (typeof parsed.error === "string" && parsed.error) ||
          (typeof parsed.message === "string" && parsed.message) ||
          text;
        throw new Error(message);
      } catch {
        throw new Error(text);
      }
    }
    throw new Error("Request failed");
  }
  return res.json();
}

export const adminApi = {
  me: () => apiFetch<{ isAdmin: boolean; email?: string }>("/api/admin/me"),
  kpis: () =>
    apiFetch<{
      activeTenants: number;
      churned30d: number;
      posts30d: number;
      reviews30d: number;
      failedJobs: number;
      mrr?: number;
      trend?: number;
    }>("/api/admin/kpis"),
  tenants: (params?: { page?: number; pageSize?: number; status?: string; q?: string }) =>
    apiFetch<{ rows: any[]; total: number }>("/api/admin/tenants", { searchParams: params }),
  tenant: (id: string) => apiFetch<any>(`/api/admin/tenants/${id}`),
  setTenantAutomationPaused: (id: string, paused: boolean) =>
    apiFetch<{ tenant_id: string; paused: boolean }>(`/api/admin/tenants/${id}`, { method: "PATCH", body: { paused } }),
  invite: (payload: unknown) => apiFetch<{ link: string | null; emailed: boolean }>("/api/admin/onboarding/invite", { method: "POST", body: payload }),
  onboardingList: () => apiFetch<{ rows: any[] }>("/api/admin/onboarding/list"),
  onboardingCancel: (email: string) =>
    apiFetch<{ canceled: boolean; resendReady: boolean; message?: string | null; deletedAuthUsers?: number; deletedPublicRows?: number }>(
      "/api/admin/onboarding/cancel",
      { method: "POST", body: { email } },
    ),
  onboardingDelete: (email: string) =>
    apiFetch<{ deleted: boolean }>("/api/admin/onboarding/delete", { method: "POST", body: { email } }),
  onboardingResend: (payload: unknown) =>
    apiFetch<{ emailed: boolean; link: string | null; status: string }>("/api/admin/onboarding/resend", { method: "POST", body: payload }),
  updateLocationLimit: (id: string, location_limit: number) =>
    apiFetch(`/api/admin/tenants/${id}/location_limit`, { method: "POST", body: { location_limit } }),
  impersonateStart: (tenantId: string, reason: string) =>
    apiFetch<{ started: boolean }>("/api/admin/impersonate/start", { method: "POST", body: { tenantId, reason } }),
  impersonateStop: () => apiFetch<{ ended: boolean }>("/api/admin/impersonate/stop", { method: "POST" }),
  audit: (params?: { page?: number; pageSize?: number }) => apiFetch<{ rows: any[]; total: number }>("/api/admin/audit", { searchParams: params }),
  billing: () => apiFetch<{ rows: any[] }>("/api/admin/billing"),
  gbp: () => apiFetch<{ rows: any[] }>("/api/admin/gbp"),
  usage: (params?: { from?: string; to?: string; plan?: string }) =>
    apiFetch<{ aggregates: any; rankings: any[] }>("/api/admin/usage", { searchParams: params }),
  support: (params?: { status?: string }) => apiFetch<{ rows: any[] }>("/api/admin/support", { searchParams: params }),
};

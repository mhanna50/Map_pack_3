type FetchOptions = { method?: "GET" | "POST"; body?: unknown; searchParams?: Record<string, string | number | undefined> };

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
    throw new Error(text || "Request failed");
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
  tenants: (params?: { page?: number; pageSize?: number; status?: string; plan?: string; q?: string }) =>
    apiFetch<{ rows: unknown[]; total: number }>("/api/admin/tenants", { searchParams: params }),
  tenant: (id: string) => apiFetch<unknown>(`/api/admin/tenants/${id}`),
  invite: (payload: unknown) => apiFetch<{ link: string | null; emailed: boolean }>("/api/admin/onboarding/invite", { method: "POST", body: payload }),
  onboardingList: () => apiFetch<{ rows: unknown[] }>("/api/admin/onboarding/list"),
  onboardingResend: (email: string) =>
    apiFetch<{ emailed: boolean; link?: string | null }>("/api/admin/onboarding/resend", { method: "POST", body: { email } }),
  onboardingCancel: (email: string) =>
    apiFetch<{ canceled: boolean }>("/api/admin/onboarding/cancel", { method: "POST", body: { email } }),
  updateLocationLimit: (id: string, location_limit: number) =>
    apiFetch(`/api/admin/tenants/${id}/location_limit`, { method: "POST", body: { location_limit } }),
  impersonateStart: (tenantId: string, reason: string) =>
    apiFetch<{ started: boolean }>("/api/admin/impersonate/start", { method: "POST", body: { tenantId, reason } }),
  impersonateStop: () => apiFetch<{ ended: boolean }>("/api/admin/impersonate/stop", { method: "POST" }),
  audit: (params?: { page?: number; pageSize?: number }) => apiFetch<{ rows: unknown[]; total: number }>("/api/admin/audit", { searchParams: params }),
  billing: () => apiFetch<{ rows: unknown[] }>("/api/admin/billing"),
  gbp: () => apiFetch<{ rows: unknown[] }>("/api/admin/gbp"),
  usage: (params?: { from?: string; to?: string; plan?: string }) =>
    apiFetch<{ aggregates: unknown; rankings: unknown[] }>("/api/admin/usage", { searchParams: params }),
  support: (params?: { status?: string }) => apiFetch<{ rows: unknown[] }>("/api/admin/support", { searchParams: params }),
};

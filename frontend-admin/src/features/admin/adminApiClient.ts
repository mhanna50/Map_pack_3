type FetchOptions = { method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown; searchParams?: Record<string, string | number | undefined> };
type MonitoringParams = {
  tenant_id?: string;
  tenant_ids?: string;
  range?: string;
  from?: string;
  to?: string;
  module?: string;
  status?: string;
  q?: string;
};

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
    apiFetch<{ rows: unknown[]; total: number }>("/api/admin/tenants", { searchParams: params }),
  tenant: (id: string) => apiFetch<unknown>(`/api/admin/tenants/${id}`),
  deleteTenant: (id: string) => apiFetch<{ terminated: boolean; tenant_id: string; stripe?: { canceled?: number }; auth?: { deletedUsers?: number } }>(`/api/admin/tenants/${id}`, { method: "DELETE" }),
  setTenantAutomationPaused: (id: string, paused: boolean) =>
    apiFetch<{ tenant_id: string; paused: boolean }>(`/api/admin/tenants/${id}`, { method: "PATCH", body: { paused } }),
  invite: (payload: unknown) => apiFetch<{ link: string | null; emailed: boolean }>("/api/admin/onboarding/invite", { method: "POST", body: payload }),
  onboardingList: () => apiFetch<{ rows: unknown[] }>("/api/admin/onboarding/list"),
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
  impersonateStart: (tenantId: string, reason: string, targetPath?: string) =>
    apiFetch<{ started: boolean; targetPath?: string }>("/api/admin/impersonate/start", { method: "POST", body: { tenantId, reason, targetPath } }),
  impersonateStop: (tenantId?: string) => apiFetch<{ ended: boolean }>("/api/admin/impersonate/stop", { method: "POST", body: tenantId ? { tenantId } : undefined }),
  impersonateDeepLink: (tenantId: string, targetPath: string, module?: string) =>
    apiFetch<{ started: boolean; targetPath: string }>("/api/admin/impersonate/deep-link", { method: "POST", body: { tenantId, targetPath, module } }),
  audit: (params?: { page?: number; pageSize?: number }) => apiFetch<{ rows: unknown[]; total: number }>("/api/admin/audit", { searchParams: params }),
  billing: () => apiFetch<Record<string, unknown>>("/api/admin/billing"),
  billingAction: (payload: unknown) => apiFetch<Record<string, unknown>>("/api/admin/billing", { method: "POST", body: payload }),
  gbp: () => apiFetch<{ rows: unknown[] }>("/api/admin/gbp"),
  usage: (params?: { from?: string; to?: string; plan?: string }) =>
    apiFetch<{ aggregates: Record<string, unknown>; rankings: unknown[] }>("/api/admin/usage", { searchParams: params }),
  support: (params?: { status?: string }) => apiFetch<{ rows: unknown[] }>("/api/admin/support", { searchParams: params }),
  roles: () => apiFetch<Record<string, unknown>>("/api/admin/roles"),
  monitoringOverview: (params?: MonitoringParams) =>
    apiFetch<Record<string, unknown>>("/api/admin/monitoring/overview", { searchParams: params }),
  monitoringClients: (params?: MonitoringParams) =>
    apiFetch<{ rows: unknown[]; total: number; module_health?: unknown[] }>("/api/admin/monitoring/clients", { searchParams: params }),
  monitoringClient: (tenantId: string, params?: MonitoringParams) =>
    apiFetch<Record<string, unknown>>(`/api/admin/monitoring/clients/${tenantId}`, { searchParams: params }),
  monitoringModuleHealth: (params?: MonitoringParams) =>
    apiFetch<{ rows: unknown[]; modules?: unknown[] }>("/api/admin/monitoring/module-health", { searchParams: params }),
  monitoringModule: (module: string, params?: MonitoringParams) =>
    apiFetch<Record<string, unknown>>(`/api/admin/monitoring/modules/${module}`, { searchParams: params }),
  monitoringLeadRecovery: (params?: MonitoringParams) =>
    apiFetch<Record<string, unknown>>("/api/admin/monitoring/modules/lead-recovery/leads", { searchParams: params }),
  monitoringLeadDetail: (leadId: string) =>
    apiFetch<Record<string, unknown>>(`/api/admin/monitoring/modules/lead-recovery/leads/${leadId}`),
  addClientNote: (tenantId: string, note: string, pinned?: boolean) =>
    apiFetch<{ note: unknown }>(`/api/admin/monitoring/clients/${tenantId}/notes`, { method: "POST", body: { note, pinned } }),
  integrationHealth: (params?: MonitoringParams) =>
    apiFetch<Record<string, unknown>>("/api/admin/health", { searchParams: params }),
  integrationIncident: (incidentId: string) =>
    apiFetch<Record<string, unknown>>(`/api/admin/health/incidents/${incidentId}`),
};

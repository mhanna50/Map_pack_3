"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { createClient } from "./supabase/client";

export type Profile = { user_id: string; tenant_id: string; role?: string };
export type Tenant = { tenant_id: string; business_name?: string; plan?: string; timezone?: string };
export type Location = { id: string; name: string; tenant_id: string; gbp_location_id?: string | null; is_active?: boolean | null };

type TenantContextValue = {
  supabase: ReturnType<typeof createClient>;
  tenantId: string | null;
  tenant?: Tenant;
  profile?: Profile;
  locations: Location[];
  selectedLocationId: string | null;
  setSelectedLocationId: (id: string | null) => void;
  loading: boolean;
  error?: string | null;
  refresh: () => Promise<void>;
};

const TenantContext = createContext<TenantContextValue | undefined>(undefined);
const STORAGE_KEY = "dashboard:selectedLocationId";
const IMPERSONATION_STORAGE_KEY = "dashboard:impersonationTenantId";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readImpersonationTenantId() {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const requested = params.get("impersonate_tenant");
  if (requested && uuidPattern.test(requested)) {
    window.sessionStorage.setItem(IMPERSONATION_STORAGE_KEY, requested);
    return requested;
  }
  const stored = window.sessionStorage.getItem(IMPERSONATION_STORAGE_KEY);
  return stored && uuidPattern.test(stored) ? stored : null;
}

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const [profile, setProfile] = useState<Profile | undefined>();
  const [tenant, setTenant] = useState<Tenant | undefined>();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // read persisted location
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) setSelectedLocationId(stored);
  }, []);

  const persistLocation = useCallback((id: string | null) => {
    if (typeof window === "undefined") return;
    if (id) window.localStorage.setItem(STORAGE_KEY, id);
    else window.localStorage.removeItem(STORAGE_KEY);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      // If the persisted refresh token is invalid/stale, clear it and treat as signed-out.
      if (sessionError && sessionError.message?.toLowerCase().includes("invalid refresh token")) {
        await supabase.auth.signOut();
        setProfile(undefined);
        setTenant(undefined);
        setLocations([]);
        setSelectedLocationId(null);
        persistLocation(null);
        setTenantId(null);
        setLoading(false);
        return;
      }
      if (sessionError) throw sessionError;
      const userId = session?.user?.id;
      if (!userId) {
        setTenantId(null);
        setLoading(false);
        return;
      }

      const requestedImpersonationTenantId = readImpersonationTenantId();
      if (requestedImpersonationTenantId) {
        const { data: routeData } = await supabase.rpc("resolve_post_login_destination");
        const route = Array.isArray(routeData) ? routeData[0] : routeData;
        const isOwnerAdmin =
          route && typeof route === "object" && String((route as { role?: unknown }).role ?? "").toLowerCase() === "owner_admin";
        if (isOwnerAdmin) {
          const { data: tenantData, error: tenantError } = await supabase
            .from("tenants")
            .select()
            .eq("tenant_id", requestedImpersonationTenantId)
            .maybeSingle();
          if (tenantError) throw tenantError;
          setProfile({ user_id: userId, tenant_id: requestedImpersonationTenantId, role: "owner_admin" });
          setTenantId(requestedImpersonationTenantId);
          setTenant(tenantData ?? undefined);
          const { data: locationsData, error: locationError } = await supabase
            .from("locations")
            .select()
            .eq("tenant_id", requestedImpersonationTenantId)
            .order("name", { ascending: true });
          if (locationError) throw locationError;
          setLocations(locationsData ?? []);
          if (locationsData && locationsData.length > 0) {
            const hasSelected = locationsData.some((loc) => loc.id === selectedLocationId);
            if (!hasSelected) {
              const firstId = locationsData[0].id;
              setSelectedLocationId(firstId);
              persistLocation(firstId);
            }
          } else {
            setSelectedLocationId(null);
            persistLocation(null);
          }
          setLoading(false);
          return;
        }
        window.sessionStorage.removeItem(IMPERSONATION_STORAGE_KEY);
      }

      const { data: profileData, error: profileError } = await supabase.from("profiles").select().eq("user_id", userId).maybeSingle();
      if (profileError) throw profileError;
      setProfile(profileData ?? undefined);

      const tenantId = profileData?.tenant_id;
      setTenantId(tenantId ?? null);
      if (!tenantId) {
        setTenantId(null);
        setTenant(undefined);
        setLocations([]);
        setSelectedLocationId(null);
        setLoading(false);
        return;
      }

      const { data: tenantData, error: tenantError } = await supabase.from("tenants").select().eq("tenant_id", tenantId).maybeSingle();
      if (tenantError) throw tenantError;
      setTenant(tenantData ?? undefined);

      const { data: locationsData, error: locationError } = await supabase
        .from("locations")
        .select()
        .eq("tenant_id", tenantId)
        .order("name", { ascending: true });
      if (locationError) throw locationError;
      setLocations(locationsData ?? []);

      // reset selection if missing
      if (locationsData && locationsData.length > 0) {
        const hasSelected = locationsData.some((loc) => loc.id === selectedLocationId);
        if (!hasSelected) {
          const firstId = locationsData[0].id;
          setSelectedLocationId(firstId);
          persistLocation(firstId);
        }
      } else {
        setSelectedLocationId(null);
        persistLocation(null);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unable to load tenant context";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [supabase, selectedLocationId, persistLocation]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const setLocation = useCallback(
    (id: string | null) => {
      setSelectedLocationId(id);
      persistLocation(id);
    },
    [persistLocation],
  );

  const value = useMemo(
    () => ({
      supabase,
      tenantId,
      tenant,
      profile,
      locations,
      selectedLocationId,
      setSelectedLocationId: setLocation,
      loading,
      error,
      refresh,
    }),
    [supabase, tenantId, tenant, profile, locations, selectedLocationId, setLocation, loading, error, refresh],
  );

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant() {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error("useTenant must be used within TenantProvider");
  return ctx;
}

import { createBrowserClient } from "@supabase/ssr";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

// Use an explicit storage key so sessions from other local Supabase projects don't collide.
const AUTH_STORAGE_KEY = "map-pack-client-auth";

export const createClient = () =>
  createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      storageKey: AUTH_STORAGE_KEY,
      persistSession: true,
      autoRefreshToken: true,
    },
  });

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "./client";

export const getAccessToken = async (client?: SupabaseClient) => {
  const supabase = client ?? createClient();
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (message.includes("invalid refresh token") || message.includes("refresh token not found")) {
      await supabase.auth.signOut({ scope: "local" });
      return null;
    }
    throw error;
  }
};

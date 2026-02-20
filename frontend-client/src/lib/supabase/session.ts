import { createClient } from "./client";

export const getAccessToken = async () => {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
};

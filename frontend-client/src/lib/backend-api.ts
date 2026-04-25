import { getAccessToken } from "@/lib/supabase/session";
import type { SupabaseClient } from "@supabase/supabase-js";

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api").replace(/\/+$/, "");

type RequestOptions = RequestInit & {
  query?: Record<string, string | number | boolean | null | undefined>;
};

export async function fetchBackendJson<T>(
  path: string,
  options: RequestOptions = {},
  client?: SupabaseClient,
): Promise<T> {
  const token = await getAccessToken(client);
  if (!token) {
    throw new Error("Not authenticated");
  }
  const url = buildUrl(path, options.query);
  const headers = new Headers(options.headers ?? {});
  headers.set("Authorization", `Bearer ${token}`);
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(url, {
    ...options,
    headers,
  });
  if (!response.ok) {
    let detail = `Request failed with status ${response.status}`;
    try {
      const payload = await response.json();
      if (payload && typeof payload.detail === "string") {
        detail = payload.detail;
      }
    } catch {
      // no-op
    }
    throw new Error(detail);
  }
  return (await response.json()) as T;
}

function buildUrl(path: string, query?: RequestOptions["query"]) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${API_BASE_URL}${normalizedPath}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

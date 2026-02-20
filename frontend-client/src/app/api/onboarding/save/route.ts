import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createServiceClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export async function POST(request: NextRequest) {
  if (!url || !anonKey || !serviceKey) {
    return NextResponse.json({ error: "Supabase keys not configured" }, { status: 500 });
  }

  const cookieStore = cookies();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      get(name) {
        return cookieStore.get(name)?.value;
      },
      set() {},
      remove() {},
    },
  });

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user?.email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json();
  const svc = createServiceClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const email = user.email.toLowerCase();

  const { data: existing, error: fetchErr } = await svc.from("pending_onboarding").select("*").eq("email", email).maybeSingle();
  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 400 });
  }

  const merged = {
    email,
    business_name: body.business_name ?? existing?.business_name ?? "",
    first_name: body.first_name ?? existing?.first_name ?? "",
    last_name: body.last_name ?? existing?.last_name ?? "",
    plan: existing?.plan ?? body.plan ?? "starter",
    location_limit: existing?.location_limit ?? body.location_limit ?? 1,
    status: body.status ?? existing?.status ?? "in_progress",
    invited_at: existing?.invited_at ?? new Date().toISOString(),
    invited_by_admin_user_id: existing?.invited_by_admin_user_id ?? null,
    tenant_id: existing?.tenant_id ?? body.tenant_id ?? null,
  };

  const { data: saved, error: upsertErr } = await svc
    .from("pending_onboarding")
    .upsert(merged, { onConflict: "email" })
    .select()
    .maybeSingle();

  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 400 });
  }

  return NextResponse.json({ saved: true, pending: saved ?? merged });
}

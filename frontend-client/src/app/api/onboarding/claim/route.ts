import { NextResponse, NextRequest } from "next/server";
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

  const svc = createServiceClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  // Find pending invite by email
  const { data: pending, error: pendingErr } = await svc
    .from("pending_onboarding")
    .select("*")
    .eq("email", user.email.toLowerCase())
    .maybeSingle();

  if (pendingErr) {
    return NextResponse.json({ error: pendingErr.message }, { status: 400 });
  }
  if (!pending) {
    return NextResponse.json({ error: "No pending invite" }, { status: 404 });
  }

  // Create tenant if it doesn't exist
  const tenantId = pending.tenant_id ?? crypto.randomUUID();
  if (!pending.tenant_id) {
    const businessName = pending.business_name ?? "";
    const slug =
      businessName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || tenantId;
    const { error: tenantErr } = await svc.from("tenants").insert({
      tenant_id: tenantId,
      business_name: businessName,
      slug,
      status: "active",
      plan_name: pending.plan ?? "starter",
      plan_tier: pending.plan ?? "starter",
      location_limit: pending.location_limit ?? 1,
    });
    if (tenantErr) {
      return NextResponse.json({ error: tenantErr.message }, { status: 400 });
    }
  }

  // Upsert profile for this user
  const { error: profileErr } = await svc
    .from("profiles")
    .upsert({
      user_id: user.id,
      email: user.email.toLowerCase(),
      tenant_id: tenantId,
      role: "owner",
    });
  if (profileErr) {
    return NextResponse.json({ error: profileErr.message }, { status: 400 });
  }

  // Mark pending invite completed
  await svc.from("pending_onboarding").update({ status: "completed", tenant_id: tenantId }).eq("email", user.email.toLowerCase());

  return NextResponse.json({
    tenant_id: tenantId,
    business_name: pending.business_name,
    first_name: pending.first_name,
    last_name: pending.last_name,
    plan_name: pending.plan,
    location_limit: pending.location_limit,
  });
}

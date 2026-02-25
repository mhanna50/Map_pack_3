import { NextRequest, NextResponse } from "next/server";
import { fetchTenantDetail, requireAdminUser, setTenantAutomationPaused } from "@/lib/adminDb";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminUser();
    const { id } = await context.params;
    const data = await fetchTenantDetail(id);
    return NextResponse.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "failed to load tenant";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminUser();
    const { id } = await context.params;
    const body = await request.json();
    if (typeof body?.paused !== "boolean") {
      return NextResponse.json({ error: "paused must be a boolean" }, { status: 400 });
    }
    const paused = body.paused;
    const data = await setTenantAutomationPaused(id, paused);
    return NextResponse.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "failed to update tenant automation state";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

import { NextResponse } from "next/server";
import {
  addAdminBusinessExpense,
  deleteAdminBusinessExpense,
  fetchBilling,
  requireAdminUser,
  saveAdminFinanceSettings,
} from "@/features/admin/adminDb";

export async function GET() {
  try {
    await requireAdminUser();
    const data = await fetchBilling();
    return NextResponse.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "failed to load billing";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    await requireAdminUser();
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action ?? "");
    if (action === "save_finance_settings") {
      return NextResponse.json({ settings: await saveAdminFinanceSettings((body.settings ?? {}) as Record<string, unknown>) });
    }
    if (action === "add_expense") {
      return NextResponse.json({ expense: await addAdminBusinessExpense((body.expense ?? {}) as Record<string, unknown>) });
    }
    if (action === "delete_expense") {
      return NextResponse.json(await deleteAdminBusinessExpense(String(body.id ?? "")));
    }
    return NextResponse.json({ error: "Unknown billing action" }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "failed to update billing";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { addAdminClientNote, getAdminClientNotes, requireAdminUser } from "@/features/admin/adminDb";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminUser();
    const { id } = await context.params;
    if (!uuidPattern.test(id)) return NextResponse.json({ error: "Valid tenant id is required" }, { status: 400 });
    return NextResponse.json(await getAdminClientNotes(id));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "failed to load notes";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdminUser();
    const { id } = await context.params;
    if (!uuidPattern.test(id)) return NextResponse.json({ error: "Valid tenant id is required" }, { status: 400 });
    const body = await request.json();
    const note = typeof body?.note === "string" ? body.note.trim() : "";
    if (!note) {
      return NextResponse.json({ error: "note is required" }, { status: 400 });
    }
    if (note.length > 4000) {
      return NextResponse.json({ error: "note must be 4000 characters or fewer" }, { status: 400 });
    }
    return NextResponse.json({ note: await addAdminClientNote(id, note, admin.id, body.pinned === true) });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "failed to save note";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

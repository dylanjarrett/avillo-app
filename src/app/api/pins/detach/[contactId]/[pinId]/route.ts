// app/api/pins/detach/[contactId]/[pinId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { contactId: string; pinId: string } }
) {
  try {
    const ctx = await requireWorkspace();
    if (!ctx.ok) return NextResponse.json(ctx.error, { status: ctx.status });

    const contactId = params?.contactId;
    const pinId = params?.pinId;

    if (!contactId) return NextResponse.json({ error: "Contact id is required." }, { status: 400 });
    if (!pinId) return NextResponse.json({ error: "Pin id is required." }, { status: 400 });

    // Ensure both belong to workspace (prevents cross-tenant leakage)
    const [contact, pin] = await Promise.all([
      prisma.contact.findFirst({
        where: { id: contactId, workspaceId: ctx.workspaceId },
        select: { id: true },
      }),
      prisma.pin.findFirst({
        where: { id: pinId, workspaceId: ctx.workspaceId },
        select: { id: true },
      }),
    ]);

    if (!contact) return NextResponse.json({ error: "Contact not found." }, { status: 404 });
    if (!pin) return NextResponse.json({ error: "Pin not found." }, { status: 404 });

    await prisma.contactPin.deleteMany({
      where: { workspaceId: ctx.workspaceId, contactId, pinId },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("api/pins/detach/[contactId]/[pinId] DELETE error:", err);
    return NextResponse.json(
      { error: "We couldn’t remove this pin. Try again, or email support@avillo.io if it continues." },
      { status: 500 }
    );
  }
}

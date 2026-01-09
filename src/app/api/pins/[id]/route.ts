//pins/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";
import { normalizePinName } from "@/lib/pins/normalizePin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UpdatePinBody = {
  name?: string;
};

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireWorkspace();
    if (!ctx.ok) return NextResponse.json(ctx.error, { status: ctx.status });

    const pinId = params?.id;
    if (!pinId) return NextResponse.json({ error: "Pin id is required." }, { status: 400 });

    const existing = await prisma.pin.findFirst({
      where: { id: pinId, workspaceId: ctx.workspaceId },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: "Pin not found." }, { status: 404 });

    const body = (await req.json().catch(() => null)) as UpdatePinBody | null;
    const { name, nameKey } = normalizePinName(body?.name);

    if (!name) return NextResponse.json({ error: "Pin name is required." }, { status: 400 });

    const pin = await prisma.pin.update({
      where: { id: pinId },
      data: { name, nameKey },
      select: { id: true, name: true, nameKey: true, updatedAt: true },
    });

    return NextResponse.json({
      pin: { id: pin.id, name: pin.name, nameKey: pin.nameKey, updatedAt: pin.updatedAt.toISOString() },
    });
  } catch (err) {
    console.error("api/pins/[id] PATCH error:", err);
    return NextResponse.json(
      { error: "We couldn’t update this pin. Try again, or email support@avillo.io if it continues." },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireWorkspace();
    if (!ctx.ok) return NextResponse.json(ctx.error, { status: ctx.status });

    const pinId = params?.id;
    if (!pinId) return NextResponse.json({ error: "Pin id is required." }, { status: 400 });

    const existing = await prisma.pin.findFirst({
      where: { id: pinId, workspaceId: ctx.workspaceId },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: "Pin not found." }, { status: 404 });

    await prisma.pin.delete({ where: { id: pinId } });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("api/pins/[id] DELETE error:", err);
    return NextResponse.json(
      { error: "We couldn’t delete this pin. Try again, or email support@avillo.io if it continues." },
      { status: 500 }
    );
  }
}
//pins/route.ts

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";
import { normalizePinName } from "@/lib/pins/normalizePin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CreatePinBody = {
  name?: string;
};

export async function GET(_req: NextRequest) {
  try {
    const ctx = await requireWorkspace();
    if (!ctx.ok) return NextResponse.json(ctx.error, { status: ctx.status });

    const pins = await prisma.pin.findMany({
      where: { workspaceId: ctx.workspaceId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, nameKey: true, createdAt: true, updatedAt: true },
    });

    return NextResponse.json({
      pins: pins.map((p) => ({
        id: p.id,
        name: p.name,
        nameKey: p.nameKey,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      })),
    });
  } catch (err) {
    console.error("api/pins GET error:", err);
    return NextResponse.json(
      { error: "We couldn’t load pins. Try again, or email support@avillo.io if it continues." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireWorkspace();
    if (!ctx.ok) return NextResponse.json(ctx.error, { status: ctx.status });

    const body = (await req.json().catch(() => null)) as CreatePinBody | null;
    const { name, nameKey } = normalizePinName(body?.name);

    if (!name) {
      return NextResponse.json({ error: "Pin name is required." }, { status: 400 });
    }

    const pin = await prisma.pin.upsert({
      where: { workspaceId_nameKey: { workspaceId: ctx.workspaceId, nameKey } },
      update: { name, updatedAt: new Date() },
      create: {
        workspaceId: ctx.workspaceId,
        name,
        nameKey,
        createdByUserId: ctx.userId,
      },
      select: { id: true, name: true, nameKey: true, createdAt: true, updatedAt: true },
    });

    return NextResponse.json({
      pin: {
        id: pin.id,
        name: pin.name,
        nameKey: pin.nameKey,
        createdAt: pin.createdAt.toISOString(),
        updatedAt: pin.updatedAt.toISOString(),
      },
    });
  } catch (err) {
    console.error("api/pins POST error:", err);
    return NextResponse.json(
      { error: "We couldn’t create this pin. Try again, or email support@avillo.io if it continues." },
      { status: 500 }
    );
  }
}
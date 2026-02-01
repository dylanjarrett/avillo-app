//api/pins/listings/attach/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";
import { normalizePinName } from "@/lib/pins/normalizePin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AttachPinBody = {
  pinId?: string;
  name?: string;
  allowCreate?: boolean;
};

function fuzzyCandidates(
  all: Array<{ id: string; name: string; nameKey: string }>,
  targetKey: string
) {
  const t = targetKey.toLowerCase();
  return all
    .map((p) => ({
      id: p.id,
      name: p.name,
      nameKey: p.nameKey,
      score:
        (p.nameKey === t ? 0 : 999) +
        (p.nameKey.startsWith(t) ? 1 : 0) +
        (p.nameKey.includes(t) ? 2 : 0),
    }))
    .sort((a, b) => a.score - b.score)
    .slice(0, 5)
    .map(({ id, name, nameKey }) => ({ id, name, nameKey }));
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireWorkspace();
    if (!ctx.ok) return NextResponse.json(ctx.error, { status: ctx.status });

    const listingId = params?.id;
    if (!listingId) return NextResponse.json({ error: "Listing id is required." }, { status: 400 });

    const listing = await prisma.listing.findFirst({
      where: { id: listingId, workspaceId: ctx.workspaceId },
      select: { id: true },
    });
    if (!listing) return NextResponse.json({ error: "Listing not found." }, { status: 404 });

    const rows = await prisma.listingPin.findMany({
      where: { workspaceId: ctx.workspaceId, listingId },
      include: { pin: { select: { id: true, name: true, nameKey: true } } },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      pins: rows.map((r) => ({
        id: r.pin.id,
        name: r.pin.name,
        nameKey: r.pin.nameKey,
        attachedAt: r.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    console.error("api/pins/listings/attach/[id] GET error:", err);
    return NextResponse.json(
      { error: "We couldn’t load pins for this listing. Try again, or email support@avillo.io if it continues." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireWorkspace();
    if (!ctx.ok) return NextResponse.json(ctx.error, { status: ctx.status });

    const listingId = params?.id;
    if (!listingId) return NextResponse.json({ error: "Listing id is required." }, { status: 400 });

    const listing = await prisma.listing.findFirst({
      where: { id: listingId, workspaceId: ctx.workspaceId },
      select: { id: true },
    });
    if (!listing) return NextResponse.json({ error: "Listing not found." }, { status: 404 });

    const body = (await req.json().catch(() => null)) as AttachPinBody | null;

    let pinId = String(body?.pinId ?? "").trim();

    // If no pinId, resolve by name (create only if allowCreate===true)
    if (!pinId) {
      const { name, nameKey } = normalizePinName(body?.name);
      if (!nameKey) return NextResponse.json({ error: "pinId or name is required." }, { status: 400 });

      const existing = await prisma.pin.findFirst({
        where: { workspaceId: ctx.workspaceId, nameKey },
        select: { id: true },
      });

      if (existing) {
        pinId = existing.id;
      } else {
        if (!body?.allowCreate) {
          const maybe = await prisma.pin.findMany({
            where: {
              workspaceId: ctx.workspaceId,
              OR: [
                { nameKey: { startsWith: nameKey.slice(0, Math.min(3, nameKey.length)) } },
                { nameKey: { contains: nameKey.split(" ")[0] || nameKey } },
              ],
            },
            select: { id: true, name: true, nameKey: true },
            take: 15,
          });

          return NextResponse.json(
            {
              error: "Pin does not exist. Confirmation required to create.",
              code: "PIN_CREATE_CONFIRM_REQUIRED",
              normalized: { name, nameKey },
              suggestions: fuzzyCandidates(maybe, nameKey),
            },
            { status: 409 }
          );
        }

        const created = await prisma.pin.create({
          data: { workspaceId: ctx.workspaceId, name, nameKey, createdByUserId: ctx.userId },
          select: { id: true },
        });

        pinId = created.id;
      }
    } else {
      // Validate pin belongs to workspace
      const pin = await prisma.pin.findFirst({
        where: { id: pinId, workspaceId: ctx.workspaceId },
        select: { id: true },
      });
      if (!pin) return NextResponse.json({ error: "Pin not found." }, { status: 404 });
    }

    // Attach (idempotent)
    const row = await prisma.listingPin.upsert({
      where: { listingId_pinId: { listingId, pinId } },
      update: {},
      create: {
        workspaceId: ctx.workspaceId,
        listingId,
        pinId,
        createdByUserId: ctx.userId,
      },
      select: { id: true },
    });

    return NextResponse.json({ ok: true, listingPinId: row.id, pinId });
  } catch (err) {
    console.error("api/pins/listings/attach/[id] POST error:", err);
    return NextResponse.json(
      { error: "We couldn’t save this pin. Try again, or email support@avillo.io if it continues." },
      { status: 500 }
    );
  }
}
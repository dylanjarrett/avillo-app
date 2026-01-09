// src/app/api/pins/attach/[id]/route.ts

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

function fuzzyCandidates(all: Array<{ id: string; name: string; nameKey: string }>, targetKey: string) {
  // lightweight server-side suggestion: startsWith / includes heuristics (fast + index-friendly if you later move to DB)
  // For now, caller supplies a small set (from DB query).
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

    const contactId = params?.id;
    if (!contactId) return NextResponse.json({ error: "Contact id is required." }, { status: 400 });

    const contact = await prisma.contact.findFirst({
      where: { id: contactId, workspaceId: ctx.workspaceId },
      select: { id: true },
    });
    if (!contact) return NextResponse.json({ error: "Contact not found." }, { status: 404 });

    const rows = await prisma.contactPin.findMany({
      where: { workspaceId: ctx.workspaceId, contactId },
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
    console.error("api/pins/attach/[id] GET error:", err);
    return NextResponse.json(
      { error: "We couldn’t load pins for this contact. Try again, or email support@avillo.io if it continues." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireWorkspace();
    if (!ctx.ok) return NextResponse.json(ctx.error, { status: ctx.status });

    const contactId = params?.id;
    if (!contactId) return NextResponse.json({ error: "Contact id is required." }, { status: 400 });

    const contact = await prisma.contact.findFirst({
      where: { id: contactId, workspaceId: ctx.workspaceId },
      select: { id: true },
    });
    if (!contact) return NextResponse.json({ error: "Contact not found." }, { status: 404 });

    const body = (await req.json().catch(() => null)) as AttachPinBody | null;

    let pinId = String(body?.pinId ?? "").trim();

    // If no pinId, resolve by name (and only create if allowCreate === true)
    if (!pinId) {
      const { name, nameKey } = normalizePinName(body?.name);
      if (!nameKey) return NextResponse.json({ error: "pinId or name is required." }, { status: 400 });

      // 1) try existing (workspace-scoped)
      const existing = await prisma.pin.findFirst({
        where: { workspaceId: ctx.workspaceId, nameKey },
        select: { id: true },
      });

      if (existing) {
        pinId = existing.id;
      } else {
        // 2) guard creation behind explicit confirmation
        if (!body?.allowCreate) {
          // Provide a few suggestions (helpful for typos)
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
      // Validate pin belongs to this workspace
      const pin = await prisma.pin.findFirst({
        where: { id: pinId, workspaceId: ctx.workspaceId },
        select: { id: true },
      });
      if (!pin) return NextResponse.json({ error: "Pin not found." }, { status: 404 });
    }

    // Attach (idempotent)
    const row = await prisma.contactPin.upsert({
      where: { contactId_pinId: { contactId, pinId } },
      update: {},
      create: {
        workspaceId: ctx.workspaceId,
        contactId,
        pinId,
        createdByUserId: ctx.userId,
      },
      select: { id: true },
    });

    return NextResponse.json({ ok: true, contactPinId: row.id, pinId });
  } catch (err) {
    console.error("api/pins/attach/[id] POST error:", err);
    return NextResponse.json(
      { error: "We couldn’t save this pin. Try again, or email support@avillo.io if it continues." },
      { status: 500 }
    );
  }
}

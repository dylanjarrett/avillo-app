//api/listings/[id]/notes/route
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";
import { parseTaskInstant, safeIanaTZ, normalizeToMinute } from "@/lib/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CreateNoteBody = {
  text?: string;
  taskAt?: string | null;

  // Optional: browser IANA timezone, e.g. "America/Los_Angeles"
  // If taskAt is sent WITHOUT a Z/offset, we interpret it in this tz.
  tz?: string | null;
};

function safeTrim(v?: string | null) {
  const t = String(v ?? "").trim();
  return t.length ? t : "";
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const ctx = await requireWorkspace();
    // keeping same guard style as your People route
    // (if your requireWorkspace returns { ok, status, error } in your codebase)
    // If yours throws instead, remove these 2 lines.
    // @ts-ignore
    if (ctx?.ok === false) return NextResponse.json(ctx.error, { status: ctx.status });

    const workspaceId = (ctx as any).workspaceId ?? ctx?.workspaceId;
    const userId = (ctx as any).userId ?? ctx?.userId;

    const listingId = params?.id;
    if (!listingId) {
      return NextResponse.json({ error: "Listing id is required." }, { status: 400 });
    }

    // workspace-scoped listing lookup
    const listing = await prisma.listing.findFirst({
      where: { id: listingId, workspaceId },
      select: { id: true, address: true },
    });

    if (!listing) return NextResponse.json({ error: "Listing not found." }, { status: 404 });

    const body = (await req.json().catch(() => null)) as CreateNoteBody | null;

    const noteText = safeTrim(body?.text);
    if (!noteText) return NextResponse.json({ error: "Note text is required." }, { status: 400 });

    // ✅ Canonical task time parsing (src/lib/time.ts)
    const tz = safeIanaTZ(body?.tz) ?? null;
    const taskDate = parseTaskInstant(body?.taskAt ?? null, tz);

    const note = await prisma.$transaction(async (tx) => {
      const createdNote = await tx.listingNote.create({
        data: {
          listingId: listing.id,
          text: noteText,
          reminderAt: taskDate,
        },
      });

      await tx.cRMActivity.create({
        data: {
          workspaceId,
          actorUserId: userId,
          listingId: listing.id,
          type: "note",
          summary: `New note logged for ${safeTrim(listing.address)}`.trim() || "New listing note",
          data: { hasTask: !!taskDate },
        },
      });

      // If note has a task date, create a Task row so it appears on Dashboard
      // Keep consistent with People behavior: PEOPLE_NOTE task source
      if (taskDate) {
        const title = `Task for listing: ${safeTrim(listing.address) || "Listing"}`;

        // ✅ Global minute-stable rule for dedupe window
        const windowStart = normalizeToMinute(new Date(Date.now() - 10 * 60 * 1000));

        const existing = await tx.task.findFirst({
          where: {
            workspaceId,
            assignedToUserId: userId,
            listingId: listing.id,
            status: "OPEN",
            source: "PEOPLE_NOTE",
            title,
            dueAt: taskDate,
            createdAt: { gte: windowStart },
            deletedAt: null,
          },
          orderBy: { createdAt: "desc" },
        });

        if (!existing) {
          await tx.task.create({
            data: {
              workspaceId,
              createdByUserId: userId,
              assignedToUserId: userId,
              contactId: null,
              listingId: listing.id,
              title,
              notes: noteText,
              dueAt: taskDate,
              status: "OPEN",
              source: "PEOPLE_NOTE",
            },
          });
        }
      }

      return createdNote;
    });

    return NextResponse.json({
      note: {
        id: note.id,
        text: note.text,
        createdAt: note.createdAt.toISOString(),
        taskAt: note.reminderAt ? note.reminderAt.toISOString() : null,
      },
    });
  } catch (err) {
    console.error("listings/[id]/notes POST error:", err);
    return NextResponse.json(
      { error: "We couldn’t save this note. Try again, or email support@avillo.io if it continues." },
      { status: 500 }
    );
  }
}
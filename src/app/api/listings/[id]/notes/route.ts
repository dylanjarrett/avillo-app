// /api/listings/[id]/notes/route
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";
import { parseTaskInstant, safeIanaTZ, normalizeToMinute } from "@/lib/time";
import { type VisibilityCtx, requireReadableListing } from "@/lib/visibility";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CreateNoteBody = {
  text?: string;
  taskAt?: string | null;
  tz?: string | null;
};

function safeTrim(v?: string | null) {
  const t = String(v ?? "").trim();
  return t.length ? t : "";
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireWorkspace();
    // @ts-ignore
    if (ctx?.ok === false) return NextResponse.json(ctx.error, { status: ctx.status });

    const workspaceId = (ctx as any).workspaceId ?? ctx?.workspaceId;
    const userId = (ctx as any).userId ?? ctx?.userId;

    const vctx: VisibilityCtx = {
      workspaceId,
      userId,
      isWorkspaceAdmin: false,
    };

    const listingId = params?.id;
    if (!listingId) {
      return NextResponse.json({ error: "Listing id is required." }, { status: 400 });
    }

    const listing = await requireReadableListing(prisma as any, vctx, listingId, {
      id: true,
      address: true,
    });

    const body = (await req.json().catch(() => null)) as CreateNoteBody | null;

    const noteText = safeTrim(body?.text);
    if (!noteText) return NextResponse.json({ error: "Note text is required." }, { status: 400 });

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

      if (taskDate) {
        const title = `Task for listing: ${safeTrim(listing.address) || "Listing"}`;
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
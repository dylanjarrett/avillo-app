// src/app/api/crm/contacts/[id]/notes/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CreateNoteBody = {
  text?: string;
  taskAt?: string | null;
};

function safeTrim(v?: string | null) {
  const t = String(v ?? "").trim();
  return t.length ? t : "";
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireWorkspace();
    if (!ctx.ok) return NextResponse.json(ctx.error, { status: ctx.status });

    const contactId = params?.id;
    if (!contactId) {
      return NextResponse.json({ error: "Contact id is required." }, { status: 400 });
    }

    // workspace-scoped contact lookup
    const contact = await prisma.contact.findFirst({
      where: { id: contactId, workspaceId: ctx.workspaceId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        relationshipType: true,
      },
    });

    if (!contact) return NextResponse.json({ error: "Contact not found." }, { status: 404 });

    const body = (await req.json().catch(() => null)) as CreateNoteBody | null;

    const noteText = safeTrim(body?.text);
    if (!noteText) return NextResponse.json({ error: "Note text is required." }, { status: 400 });

    // Normalize taskAt
    let taskDate: Date | null = null;
    let dueAtIso: string | null = null;

    if (body?.taskAt) {
      const parsed = new Date(body.taskAt);
      if (!Number.isNaN(parsed.getTime())) {
        dueAtIso = parsed.toISOString();
        taskDate = new Date(dueAtIso);
        taskDate.setSeconds(0, 0); // minute-stable
      }
    }

    const note = await prisma.$transaction(async (tx) => {
      const createdNote = await tx.contactNote.create({
        data: {
          contactId: contact.id,
          text: noteText,
          reminderAt: taskDate,
        },
      });

      await tx.cRMActivity.create({
        data: {
          workspaceId: ctx.workspaceId,
          actorUserId: ctx.userId,
          contactId: contact.id,
          type: "note",
          summary:
            `New note logged for ${safeTrim(contact.firstName)} ${safeTrim(contact.lastName)}`.trim() ||
            "New contact note",
          data: { hasTask: !!taskDate },
        },
      });

      // If note has a task date, create a Task row so it appears on Dashboard
      // (Partners can have notes, but your UI previously used PEOPLE_NOTE tasks; keep it consistent.)
      if (taskDate && dueAtIso) {
        const first = safeTrim(contact.firstName);
        const last = safeTrim(contact.lastName);
        const name = `${first} ${last}`.trim() || safeTrim(contact.email) || "Contact";

        const title = `Task for: ${name}`;
        const windowStart = new Date(Date.now() - 10 * 60 * 1000);

        const existing = await tx.task.findFirst({
          where: {
            workspaceId: ctx.workspaceId,
            assignedToUserId: ctx.userId,
            contactId: contact.id,
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
              workspaceId: ctx.workspaceId,
              createdByUserId: ctx.userId,
              assignedToUserId: ctx.userId,
              contactId: contact.id,
              listingId: null,
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
    console.error("crm/contacts/[id]/notes POST error:", err);
    return NextResponse.json(
      { error: "We couldn’t save this note. Try again, or email support@avillo.io if it continues." },
      { status: 500 }
    );
  }
}

// src/app/api/crm/contacts/[id]/notes/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getPrisma() {
  const { prisma } = await import("@/lib/prisma");
  return prisma;
}

type CreateNoteBody = {
  text?: string;
  taskAt?: string | null;
};

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const prisma = await getPrisma();
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }

    const contactId = params.id;
    if (!contactId) {
      return NextResponse.json({ error: "Contact id is required." }, { status: 400 });
    }

    const contact = await prisma.contact.findFirst({
      where: { id: contactId, userId: user.id },
    });

    if (!contact) {
      return NextResponse.json({ error: "Contact not found." }, { status: 404 });
    }

    const body = (await req.json().catch(() => null)) as CreateNoteBody | null;

    if (!body?.text || !body.text.trim()) {
      return NextResponse.json({ error: "Note text is required." }, { status: 400 });
    }

    let taskDate: Date | null = null;
    if (body.taskAt) {
      const parsed = new Date(body.taskAt);
      if (!isNaN(parsed.getTime())) {
        taskDate = parsed;
      }
    }

    const note = await prisma.contactNote.create({
      data: {
        contactId: contact.id,
        text: body.text.trim(),
        reminderAt: taskDate,
      },
    });

    // Log as CRM activity
    await prisma.cRMActivity.create({
      data: {
        userId: user.id,
        contactId: contact.id,
        type: "note",
        summary:
          `New note logged for ${(contact.firstName ?? "").trim()} ${(contact.lastName ?? "")
            .trim()}`.trim() || "New contact note",
        data: {
          hasTask: !!taskDate,
        },
      },
    });

    // -----------------------------
    // NEW: If task exists, create a Task row so it appears on Dashboard
    // -----------------------------
    if (taskDate) {
      const first = (contact.firstName ?? "").trim();
      const last = (contact.lastName ?? "").trim();
      const name = `${first} ${last}`.trim() || "Contact";

      const title = `Task for: ${name}`;
      const notes = body.text.trim();

      // lightweight dedupe: prevent double-POST creating duplicates
      const windowStart = new Date(Date.now() - 10 * 60 * 1000);

      const existing = await prisma.task.findFirst({
        where: {
          userId: user.id,
          contactId: contact.id,
          status: "OPEN",
          source: "PEOPLE_NOTE",
          title,
          dueAt: taskDate,
          createdAt: { gte: windowStart },
        },
        orderBy: { createdAt: "desc" },
      });

      if (!existing) {
        await prisma.task.create({
          data: {
            userId: user.id,
            contactId: contact.id,
            listingId: null,
            title,
            notes,
            dueAt: taskDate,
            status: "OPEN",
            source: "PEOPLE_NOTE",
          },
        });
      }
    }

    const shaped = {
      id: note.id,
      text: note.text,
      createdAt: note.createdAt.toISOString(),
      taskAt: note.reminderAt ? note.reminderAt.toISOString() : null,
    };

    return NextResponse.json({ note: shaped });
  } catch (err) {
    console.error("crm/contacts/[id]/notes POST error:", err);
    return NextResponse.json(
      {
        error:
          "We couldn’t save this note. Try again, or email support@avillo.io if it continues.",
      },
      { status: 500 }
    );
  }
}
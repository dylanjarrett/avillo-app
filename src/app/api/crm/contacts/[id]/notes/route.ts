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
  reminderAt?: string | null;
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
      return NextResponse.json(
        { error: "Account not found." },
        { status: 404 }
      );
    }

    const contactId = params.id;
    if (!contactId) {
      return NextResponse.json(
        { error: "Contact id is required." },
        { status: 400 }
      );
    }

    const contact = await prisma.contact.findFirst({
      where: { id: contactId, userId: user.id },
    });

    if (!contact) {
      return NextResponse.json(
        { error: "Contact not found." },
        { status: 404 }
      );
    }

    const body = (await req.json().catch(() => null)) as CreateNoteBody | null;

    if (!body?.text || !body.text.trim()) {
      return NextResponse.json(
        { error: "Note text is required." },
        { status: 400 }
      );
    }

    let reminderDate: Date | null = null;
    if (body.reminderAt) {
      const parsed = new Date(body.reminderAt);
      if (!isNaN(parsed.getTime())) {
        reminderDate = parsed;
      }
    }

    const note = await prisma.contactNote.create({
      data: {
        contactId: contact.id,
        text: body.text.trim(),
        reminderAt: reminderDate,
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
          hasReminder: !!reminderDate,
        },
      },
    });

    const shaped = {
      id: note.id,
      text: note.text,
      createdAt: note.createdAt.toISOString(),
      reminderAt: note.reminderAt ? note.reminderAt.toISOString() : null,
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
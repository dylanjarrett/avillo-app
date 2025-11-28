// src/app/api/crm/contacts/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Small helper: get prisma lazily so this file stays edge-safe if needed
async function getPrisma() {
  const { prisma } = await import("@/lib/prisma");
  return prisma;
}

/* ----------------------------------------------------
 * GET /api/crm/contacts
 * Load all contacts for the logged-in user
 * ---------------------------------------------------*/
export async function GET(_req: NextRequest) {
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

    const contacts = await prisma.contact.findMany({
      where: { userId: user.id },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    });

    const items = contacts.map((c) => {
      const name =
        `${(c.firstName ?? "").trim()} ${(c.lastName ?? "").trim()}`.trim() ||
        c.email ||
        "Unnamed contact";

      return {
        id: c.id,
        name,
        label: c.label ?? "",
        stage: (c.stage as any) ?? "new",
        type: c.type ?? null,
        priceRange: c.priceRange ?? "",
        areas: c.areas ?? "",
        timeline: c.timeline ?? "",
        source: c.source ?? "",
        email: c.email ?? "",
        phone: c.phone ?? "",
        nextTouchDate: c.nextTouchDate ?? "",
        lastTouchNote: c.lastTouchNote ?? "",
        workingNotes: c.workingNotes ?? "",
      };
    });

    return NextResponse.json({ contacts: items });
  } catch (err) {
    console.error("crm/contacts GET error:", err);
    return NextResponse.json(
      {
        error:
          "We couldn’t load your contacts. Try again, or email support@avillo.io if it continues.",
      },
      { status: 500 }
    );
  }
}

/* ----------------------------------------------------
 * POST /api/crm/contacts
 * Create or update a contact
 * Body:
 *  { contact: {...fields...} }   (matches front-end payload)
 * ---------------------------------------------------*/

type SaveContactBody = {
  id?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  stage?: string;
  label?: string;
  type?: string | null;
  priceRange?: string;
  areas?: string;
  timeline?: string;
  source?: string;
  nextTouchDate?: string;
  lastTouchNote?: string;
  workingNotes?: string;
};

export async function POST(req: NextRequest) {
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

    const body = (await req.json().catch(() => null)) as SaveContactBody | null;

    if (!body) {
      return NextResponse.json(
        { error: "Missing contact payload." },
        { status: 400 }
      );
    }

    const {
      id,
      firstName,
      lastName,
      email,
      phone,
      stage,
      label,
      type,
      priceRange,
      areas,
      timeline,
      source,
      nextTouchDate,
      lastTouchNote,
      workingNotes,
    } = body;

    const normalizedStage = stage && ["new", "warm", "hot", "past"].includes(stage)
      ? stage
      : "new";

    let contactRecord;

    if (id) {
      // -------------------- UPDATE --------------------
      const existing = await prisma.contact.findFirst({
        where: { id, userId: user.id },
      });

      if (!existing) {
        return NextResponse.json(
          { error: "Contact not found." },
          { status: 404 }
        );
      }

      contactRecord = await prisma.contact.update({
        where: { id: existing.id },
        data: {
          firstName: firstName ?? existing.firstName,
          lastName: lastName ?? existing.lastName,
          email: email ?? existing.email,
          phone: phone ?? existing.phone,
          stage: normalizedStage,
          label: label ?? existing.label,
          type: type ?? existing.type,
          priceRange: priceRange ?? existing.priceRange,
          areas: areas ?? existing.areas,
          timeline: timeline ?? existing.timeline,
          source: source ?? existing.source,
          nextTouchDate: nextTouchDate ?? existing.nextTouchDate,
          lastTouchNote: lastTouchNote ?? existing.lastTouchNote,
          workingNotes: workingNotes ?? existing.workingNotes,
          // keep notes in sync for older features
          notes: workingNotes ?? existing.notes,
        },
      });

      await prisma.cRMActivity.create({
        data: {
          userId: user.id,
          contactId: contactRecord.id,
          type: "updated",
          summary:
            [
              "Updated contact",
              (firstName ?? existing.firstName) ||
                (lastName ?? existing.lastName),
            ]
              .filter(Boolean)
              .join(" ") || "Updated contact",
          data: {},
        },
      });
    } else {
      // -------------------- CREATE --------------------
      contactRecord = await prisma.contact.create({
        data: {
          userId: user.id,
          firstName: firstName ?? "",
          lastName: lastName ?? "",
          email: email ?? "",
          phone: phone ?? "",
          stage: normalizedStage,
          label: label ?? "new lead",
          type: type ?? "Buyer",
          priceRange: priceRange ?? "",
          areas: areas ?? "",
          timeline: timeline ?? "",
          source: source ?? "",
          nextTouchDate: nextTouchDate ?? "",
          lastTouchNote: lastTouchNote ?? "",
          workingNotes: workingNotes ?? "",
          notes: workingNotes ?? "",
        },
      });

      await prisma.cRMActivity.create({
        data: {
          userId: user.id,
          contactId: contactRecord.id,
          type: "created",
          summary:
            `New contact: ${(firstName ?? "").trim()} ${(lastName ?? "").trim()}`.trim() ||
            "New contact added",
          data: {},
        },
      });
    }

    const name =
      `${(contactRecord.firstName ?? "").trim()} ${(contactRecord.lastName ?? "").trim()}`.trim() ||
      contactRecord.email ||
      "Unnamed contact";

    const shaped = {
      id: contactRecord.id,
      name,
      label: contactRecord.label ?? "",
      stage: (contactRecord.stage as any) ?? "new",
      type: contactRecord.type ?? null,
      priceRange: contactRecord.priceRange ?? "",
      areas: contactRecord.areas ?? "",
      timeline: contactRecord.timeline ?? "",
      source: contactRecord.source ?? "",
      email: contactRecord.email ?? "",
      phone: contactRecord.phone ?? "",
      nextTouchDate: contactRecord.nextTouchDate ?? "",
      lastTouchNote: contactRecord.lastTouchNote ?? "",
      workingNotes: contactRecord.workingNotes ?? "",
    };

    return NextResponse.json({ contact: shaped });
  } catch (err) {
    console.error("crm/contacts POST error:", err);
    return NextResponse.json(
      {
        error:
          "We couldn’t save this contact. Try again, or email support@avillo.io if it continues.",
      },
      { status: 500 }
    );
  }
}

/* ----------------------------------------------------
 * DELETE /api/crm/contacts
 * Body: { id: string }
 * ---------------------------------------------------*/
export async function DELETE(req: NextRequest) {
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

    const body = (await req.json().catch(() => null)) as { id?: string } | null;

    if (!body?.id) {
      return NextResponse.json(
        { error: "Contact id is required." },
        { status: 400 }
      );
    }

    const existing = await prisma.contact.findFirst({
      where: { id: body.id, userId: user.id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Contact not found." },
        { status: 404 }
      );
    }

    // Clean up related records that depend on this contact
    await prisma.listingBuyerLink.deleteMany({
      where: { contactId: existing.id },
    });

    await prisma.listing.updateMany({
      where: { sellerContactId: existing.id },
      data: { sellerContactId: null },
    });

    await prisma.cRMActivity.deleteMany({
      where: { contactId: existing.id, userId: user.id },
    });

    await prisma.activity.deleteMany({
      where: { contactId: existing.id, userId: user.id },
    });

    await prisma.contact.delete({
      where: { id: existing.id },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("crm/contacts DELETE error:", err);
    return NextResponse.json(
      {
        error:
          "We couldn’t delete this contact. Try again, or email support@avillo.io if it continues.",
      },
      { status: 500 }
    );
  }
}
// src/app/api/crm/contacts/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Prisma } from "@prisma/client";
import { processTriggers } from "@/lib/automations/processTriggers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lazy prisma so this route can remain edge-safe if needed
async function getPrisma() {
  const { prisma } = await import("@/lib/prisma");
  return prisma;
}

/* ----------------------------------------------------
 * Types (local to this route)
 * ---------------------------------------------------*/

type LinkedListing = {
  id: string;
  address: string | null;
  status: string | null;
  role: "buyer" | "seller";
};

/* ----------------------------------------------------
 * Normalization helpers (DB is always lowercase)
 * ---------------------------------------------------*/

const PIPELINE_STAGES = ["new", "warm", "hot", "past"] as const;
type PipelineStage = (typeof PIPELINE_STAGES)[number];

function normalizeStage(raw?: string | null): PipelineStage | undefined {
  if (!raw) return undefined;
  const value = raw.toLowerCase().trim();
  return PIPELINE_STAGES.includes(value as PipelineStage)
    ? (value as PipelineStage)
    : undefined;
}

function normalizeFreeString(raw?: string | null): string | undefined {
  const v = raw?.toLowerCase().trim();
  return v && v.length > 0 ? v : undefined;
}

/* ----------------------------------------------------
 * Shapers
 * ---------------------------------------------------*/

function shapeContactNote(note: any) {
  return {
    id: note.id,
    text: note.text,
    createdAt: note.createdAt?.toISOString?.() ?? new Date().toISOString(),
    taskAt: note.reminderAt ? note.reminderAt.toISOString() : null,
  };
}

function shapeContact(contactRecord: any, linkedListings: LinkedListing[] = []) {
  const name =
    `${(contactRecord.firstName ?? "").trim()} ${(contactRecord.lastName ?? "")
      .trim()}`.trim() ||
    contactRecord.email ||
    "Unnamed contact";

  return {
    id: contactRecord.id,
    name,
    label: contactRecord.label ?? "",
    // DB stores lowercase; UI will pretty-format
    stage: (contactRecord.stage as any) ?? "new",
    type: contactRecord.type ?? null,
    priceRange: contactRecord.priceRange ?? "",
    areas: contactRecord.areas ?? "",
    timeline: contactRecord.timeline ?? "",
    source: contactRecord.source ?? "",
    email: contactRecord.email ?? "",
    phone: contactRecord.phone ?? "",
    notes: Array.isArray(contactRecord.contactNotes)
      ? contactRecord.contactNotes.map(shapeContactNote)
      : [],
    linkedListings,
  };
}

/* ----------------------------------------------------
 * GET /api/crm/contacts
 * - Loads all contacts for the logged-in user
 * - Derives linked listings from Listing + ListingBuyerLink
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

    // 1) Base contacts + notes
    const contacts = await prisma.contact.findMany({
      where: { userId: user.id },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      include: {
        contactNotes: true,
      },
    });

    // 2) All listings for this user (for seller links)
    const listings = await prisma.listing.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        address: true,
        status: true,
        sellerContactId: true,
      },
    });

    // 3) All buyer links for this user's listings
    const buyerLinks = await prisma.listingBuyerLink.findMany({
      where: {
        listing: {
          userId: user.id,
        },
      },
      select: {
        contactId: true,
        listing: {
          select: {
            id: true,
            address: true,
            status: true,
          },
        },
      },
    });

    // 4) Build map: contactId -> LinkedListing[]
    const linkedByContact: Record<string, LinkedListing[]> = {};

    // Seller links
    for (const l of listings) {
      if (!l.sellerContactId) continue;
      if (!linkedByContact[l.sellerContactId]) {
        linkedByContact[l.sellerContactId] = [];
      }
      linkedByContact[l.sellerContactId].push({
        id: l.id,
        address: l.address,
        status: l.status,
        role: "seller",
      });
    }

    // Buyer links
    for (const link of buyerLinks) {
      if (!linkedByContact[link.contactId]) {
        linkedByContact[link.contactId] = [];
      }
      linkedByContact[link.contactId].push({
        id: link.listing.id,
        address: link.listing.address,
        status: link.listing.status,
        role: "buyer",
      });
    }

    // 5) Normalize for CRM UI
    const items = contacts.map((c) =>
      shapeContact(c, linkedByContact[c.id] ?? [])
    );

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
 * - Create or update a contact
 * - Does NOT directly touch listing relationships
 *   (those are handled by /api/listings/assign-contact
 *   and /api/listings/unlink-contact)
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
    } = body;

    // Normalized (lowercase) values for DB
    const normalizedStage = normalizeStage(stage);
    const normalizedType = normalizeFreeString(type ?? undefined);
    const normalizedSource = normalizeFreeString(source ?? undefined);

    let contactRecord;

    if (id) {
      // -------------------- UPDATE --------------------
      const existing = await prisma.contact.findFirst({
        where: { id, userId: user.id },
        include: { contactNotes: true },
      });

      if (!existing) {
        return NextResponse.json(
          { error: "Contact not found." },
          { status: 404 }
        );
      }

      const previousStage = existing.stage as PipelineStage;
      const nextStage: PipelineStage =
        normalizedStage ?? (previousStage as PipelineStage) ?? "new";


const data: any = {};

if ("firstName" in body) data.firstName = body.firstName ?? "";
if ("lastName" in body) data.lastName = body.lastName ?? "";
if ("label" in body) data.label = body.label ?? "";

if ("email" in body) data.email = body.email ?? "";
if ("phone" in body) data.phone = body.phone ?? "";

if ("stage" in body) {
  const maybeStage = normalizeStage(body.stage);
  if (maybeStage) data.stage = maybeStage;
}

if ("type" in body) {
  if (body.type === null) {
    data.type = null;
  } else {
    const v = String(body.type ?? "").toLowerCase().trim();
    data.type = v.length ? v : null;
  }
}

if ("priceRange" in body) data.priceRange = body.priceRange ?? "";
if ("areas" in body) data.areas = body.areas ?? "";
if ("timeline" in body) data.timeline = body.timeline ?? "";
if ("source" in body) {
  const v = String(body.source ?? "").toLowerCase().trim();
  data.source = v;
}

contactRecord = await prisma.contact.update({
  where: { id: existing.id },
  data,
  include: {
    contactNotes: true,
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

      // 🔔 Fire LEAD_STAGE_CHANGE when the pipeline stage actually changes
      if (previousStage !== nextStage) {
        await processTriggers("LEAD_STAGE_CHANGE", {
          userId: user.id,
          contactId: contactRecord.id,
          listingId: null,
          payload: {
            fromStage: previousStage,
            toStage: nextStage,
          },
        });
      }
    } else {
      // -------------------- CREATE --------------------
      const createStage: PipelineStage = normalizedStage ?? "new";

      contactRecord = await prisma.contact.create({
        data: {
          userId: user.id,
          firstName: firstName ?? "",
          lastName: lastName ?? "",
          email: email ?? "",
          phone: phone ?? "",
          stage: createStage,
          label: label ?? "new lead",
          type: normalizedType ?? "buyer", // stored lowercase
          priceRange: priceRange ?? "",
          areas: areas ?? "",
          timeline: timeline ?? "",
          source: normalizedSource ?? "",
        },
        include: {
          contactNotes: true,
        },
      });

      await prisma.cRMActivity.create({
        data: {
          userId: user.id,
          contactId: contactRecord.id,
          type: "created",
          summary:
            `New contact: ${(firstName ?? "").trim()} ${(lastName ?? "")
              .trim()}`.trim() || "New contact added",
          data: {},
        },
      });

      // 🔔 Fire NEW_CONTACT automation trigger
      await processTriggers("NEW_CONTACT", {
        userId: user.id,
        contactId: contactRecord.id,
        listingId: null,
        payload: {
          stage: createStage,
          source: contactRecord.source ?? "",
        },
      });
    }

    const shaped = shapeContact(contactRecord);

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
 * - Cleans up related listing links + activities + notes
 * ---------------------------------------------------*/
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Not authenticated." },
        { status: 401 }
      );
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

    const contactId = existing.id;

    // 🔄 Do all cleanup + delete in a single transaction
    await prisma.$transaction(async (tx) => {
      // 1) Remove links to listings where this contact is a buyer
      await tx.listingBuyerLink.deleteMany({
        where: { contactId },
      });

      // 2) Null out sellerContactId anywhere this contact is the seller
      await tx.listing.updateMany({
        where: { sellerContactId: contactId },
        data: { sellerContactId: null },
      });

      // 3) Delete CRM activity rows for this contact
      await tx.cRMActivity.deleteMany({
        where: { contactId, userId: user.id },
      });

      // 4) Delete general activity rows for this contact
      await tx.activity.deleteMany({
        where: { contactId, userId: user.id },
      });

      // 5) Delete tasks for this contact
      await tx.task.deleteMany({
        where: { contactId, userId: user.id },
      });

      // 6) Delete contact notes for this contact
      await tx.contactNote.deleteMany({
        where: { contactId },
      });

      // 7) Finally delete the contact itself
      await tx.contact.delete({
        where: { id: contactId },
      });
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    // Helpful logging & FK-error explanation
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2003") {
        console.error("FK constraint when deleting contact:", err);
        return NextResponse.json(
          {
            error:
              "We couldn’t delete this contact because it’s still linked to other records. Try again after removing those links, or email support@avillo.io.",
          },
          { status: 400 }
        );
      }
    }

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
// src/app/api/crm/contacts/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Prisma } from "@prisma/client";
import { processTriggers } from "@/lib/automations/processTriggers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

const PIPELINE_STAGES = ["new", "warm", "hot", "past"] as const;
type PipelineStage = (typeof PIPELINE_STAGES)[number];

/* ----------------------------------------------------
 * Normalization helpers
 * ---------------------------------------------------*/

function normalizeStage(raw?: string | null): PipelineStage | undefined {
  if (!raw) return undefined;
  const value = String(raw).toLowerCase().trim();
  return PIPELINE_STAGES.includes(value as PipelineStage)
    ? (value as PipelineStage)
    : undefined;
}

function normalizeLowerTrim(raw?: string | null): string | undefined {
  const v = raw?.toLowerCase().trim();
  return v && v.length > 0 ? v : undefined;
}

function normalizeTrim(raw?: string | null): string | undefined {
  const v = raw?.trim();
  return v && v.length > 0 ? v : undefined;
}

type RelationshipTypeLower = "client" | "partner";
function normalizeRelationshipType(raw?: string | null): RelationshipTypeLower | undefined {
  if (!raw) return undefined;
  const v = raw.toLowerCase().trim();
  if (v === "client" || v === "partner") return v;
  return undefined;
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

function shapePartnerProfile(pp: any) {
  if (!pp) return null;
  return {
    businessName: pp.businessName ?? "",
    partnerType: pp.partnerType ?? "",
    coverageMarkets: pp.coverageMarkets ?? "",
    feeComp: pp.feeComp ?? "",
    website: pp.website ?? "",
    link: pp.link ?? "",
  };
}

function shapeContact(contactRecord: any, linkedListings: LinkedListing[] = []) {
  const name =
    `${(contactRecord.firstName ?? "").trim()} ${(contactRecord.lastName ?? "").trim()}`.trim() ||
    contactRecord.email ||
    "Unnamed contact";

  const relationshipTypeRaw = String(contactRecord.relationshipType ?? "CLIENT");
  const relationshipType =
    relationshipTypeRaw.toLowerCase() === "partner" ? "partner" : "client";

  const isPartner = relationshipType === "partner";

  return {
    id: contactRecord.id,
    name,
    label: contactRecord.label ?? "",
    stage: (contactRecord.stage as any) ?? "new",
    type: contactRecord.type ?? null,

    relationshipType,

    priceRange: contactRecord.priceRange ?? "",
    areas: contactRecord.areas ?? "",
    timeline: contactRecord.timeline ?? "",
    source: contactRecord.source ?? "",
    email: contactRecord.email ?? "",
    phone: contactRecord.phone ?? "",

    // ✅ only return partnerProfile for partner contacts
    partnerProfile: isPartner ? shapePartnerProfile(contactRecord.partnerProfile) : null,

    notes: Array.isArray(contactRecord.contactNotes)
      ? contactRecord.contactNotes.map(shapeContactNote)
      : [],

    // ✅ partners never return linked listings
    linkedListings: isPartner ? [] : linkedListings,
  };
}

/* ----------------------------------------------------
 * GET /api/crm/contacts
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
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }

    const contacts = await prisma.contact.findMany({
      where: { userId: user.id },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      include: {
        contactNotes: true,
        partnerProfile: true,
      },
    });

    const listings = await prisma.listing.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        address: true,
        status: true,
        sellerContactId: true,
      },
    });

    const buyerLinks = await prisma.listingBuyerLink.findMany({
      where: { listing: { userId: user.id } },
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

    const linkedByContact: Record<string, LinkedListing[]> = {};

    for (const l of listings) {
      if (!l.sellerContactId) continue;
      if (!linkedByContact[l.sellerContactId]) linkedByContact[l.sellerContactId] = [];
      linkedByContact[l.sellerContactId].push({
        id: l.id,
        address: l.address,
        status: l.status,
        role: "seller",
      });
    }

    for (const link of buyerLinks) {
      if (!linkedByContact[link.contactId]) linkedByContact[link.contactId] = [];
      linkedByContact[link.contactId].push({
        id: link.listing.id,
        address: link.listing.address,
        status: link.listing.status,
        role: "buyer",
      });
    }

    const items = contacts.map((c: any) => shapeContact(c, linkedByContact[c.id] ?? []));
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

  relationshipType?: "client" | "partner";

  businessName?: string;
  partnerType?: string;
  coverageMarkets?: string;
  feeComp?: string;
  website?: string;
  link?: string;
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
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }

    const body = (await req.json().catch(() => null)) as SaveContactBody | null;
    if (!body) {
      return NextResponse.json({ error: "Missing contact payload." }, { status: 400 });
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
      relationshipType,
      businessName,
      partnerType,
      coverageMarkets,
      feeComp,
      website,
      link,
    } = body;

    const normalizedStage = normalizeStage(stage);
    const normalizedType = normalizeLowerTrim(type ?? undefined);
    const normalizedSource = normalizeLowerTrim(source ?? undefined);

    const normalizedRelationship = normalizeRelationshipType(relationshipType ?? null);
    const prismaRelationshipEnum =
      normalizedRelationship === "partner" ? "PARTNER" : "CLIENT";

    const partnerProfileTouched =
      "businessName" in body ||
      "partnerType" in body ||
      "coverageMarkets" in body ||
      "feeComp" in body ||
      "website" in body ||
      "link" in body;

    const partnerProfilePayload = {
      businessName: normalizeTrim(businessName) ?? "",
      partnerType: normalizeTrim(partnerType) ?? "",
      coverageMarkets: normalizeTrim(coverageMarkets) ?? "",
      feeComp: normalizeTrim(feeComp) ?? "",
      website: normalizeTrim(website) ?? "",
      link: normalizeTrim(link) ?? "",
    };

    let contactRecord: any = null;

    if (id) {
      const existing = await prisma.contact.findFirst({
        where: { id, userId: user.id },
        include: { contactNotes: true, partnerProfile: true },
      });

      if (!existing) {
        return NextResponse.json({ error: "Contact not found." }, { status: 404 });
      }

      const wasPartner = String(existing.relationshipType ?? "CLIENT") === "PARTNER";
      const willBePartner =
        "relationshipType" in body ? prismaRelationshipEnum === "PARTNER" : wasPartner;

      const previousStage =
        (normalizeStage(existing.stage) ?? ("new" as PipelineStage)) as PipelineStage;

      const data: any = {};

      if ("firstName" in body) data.firstName = body.firstName ?? "";
      if ("lastName" in body) data.lastName = body.lastName ?? "";
      if ("label" in body) data.label = body.label ?? "";
      if ("email" in body) data.email = body.email ?? "";
      if ("phone" in body) data.phone = body.phone ?? "";

      if ("relationshipType" in body) {
        data.relationshipType = prismaRelationshipEnum;
      }

      // ✅ stage: only meaningful for CLIENT contacts
      if (!willBePartner && "stage" in body) {
        const maybeStage = normalizeStage(body.stage);
        if (maybeStage) data.stage = maybeStage;
      }

      if (willBePartner) {
        data.stage = "past";
        data.type = null;

        if (partnerProfileTouched) {
          data.partnerProfile = {
            upsert: {
              create: partnerProfilePayload,
              update: partnerProfilePayload,
            },
          };
        }
      } else {
        // ✅ client updates: do NOT touch partnerProfile unless switching from partner -> client
        if ("type" in body) {
          if (body.type === null) {
            data.type = null;
          } else {
            const v = String(body.type ?? "").toLowerCase().trim();
            data.type = v.length ? v : null;
          }
        }
      }

      if ("priceRange" in body) data.priceRange = body.priceRange ?? "";
      if ("areas" in body) data.areas = body.areas ?? "";
      if ("timeline" in body) data.timeline = body.timeline ?? "";
      if ("source" in body) data.source = String(body.source ?? "").toLowerCase().trim();

      const becamePartner = !wasPartner && willBePartner;
      const switchedToClient = wasPartner && !willBePartner;

      contactRecord = await prisma.$transaction(async (tx) => {
        // ✅ If converting to PARTNER, unlink from listings
        if (becamePartner) {
          await tx.listingBuyerLink.deleteMany({ where: { contactId: existing.id } });
          await tx.listing.updateMany({
            where: { sellerContactId: existing.id, userId: user.id },
            data: { sellerContactId: null },
          });
        }

        // ✅ If converting to CLIENT, delete partner profile
        if (switchedToClient) {
          await tx.partnerProfile.deleteMany({ where: { contactId: existing.id } });
        }

        const updated = await tx.contact.update({
          where: { id: existing.id },
          data,
          include: { contactNotes: true, partnerProfile: true },
        });

        await tx.cRMActivity.create({
          data: {
            userId: user.id,
            contactId: updated.id,
            type: "updated",
            summary:
              ["Updated contact", (firstName ?? existing.firstName) || (lastName ?? existing.lastName)]
                .filter(Boolean)
                .join(" ") || "Updated contact",
            data: {
              relationshipType: String(updated.relationshipType ?? "CLIENT").toLowerCase(),
            },
          },
        });

        return updated;
      });

      const savedRelationship = String(contactRecord.relationshipType ?? "CLIENT");
      const savedStage =
        (normalizeStage(contactRecord.stage) ?? ("new" as PipelineStage)) as PipelineStage;

      if (savedRelationship === "CLIENT" && previousStage !== savedStage) {
        await processTriggers("LEAD_STAGE_CHANGE", {
          userId: user.id,
          contactId: contactRecord.id,
          listingId: null,
          payload: { fromStage: previousStage, toStage: savedStage },
        });
      }
    } else {
      const isPartner = prismaRelationshipEnum === "PARTNER";
      const createStage: PipelineStage = isPartner ? "past" : normalizedStage ?? "new";

      const createData: any = {
        userId: user.id,
        firstName: firstName ?? "",
        lastName: lastName ?? "",
        email: email ?? "",
        phone: phone ?? "",

        relationshipType: prismaRelationshipEnum as any,

        stage: createStage,
        label: label ?? (isPartner ? "partner" : "new lead"),

        type: isPartner ? null : normalizedType ?? "buyer",

        priceRange: priceRange ?? "",
        areas: areas ?? "",
        timeline: timeline ?? "",
        source: normalizedSource ?? "",
      };

      if (isPartner && partnerProfileTouched) {
        createData.partnerProfile = { create: partnerProfilePayload };
      }

      contactRecord = await prisma.contact.create({
        data: createData,
        include: { contactNotes: true, partnerProfile: true },
      });

      await prisma.cRMActivity.create({
        data: {
          userId: user.id,
          contactId: contactRecord.id,
          type: "created",
          summary:
            `New contact: ${(firstName ?? "").trim()} ${(lastName ?? "").trim()}`.trim() ||
            "New contact added",
          data: {
            relationshipType: String(contactRecord.relationshipType ?? "CLIENT").toLowerCase(),
          },
        },
      });

      if (String(contactRecord.relationshipType ?? "CLIENT") === "CLIENT") {
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
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }

    const body = (await req.json().catch(() => null)) as { id?: string } | null;
    if (!body?.id) {
      return NextResponse.json({ error: "Contact id is required." }, { status: 400 });
    }

    const existing = await prisma.contact.findFirst({
      where: { id: body.id, userId: user.id },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Contact not found." }, { status: 404 });
    }

    const contactId = existing.id;

    await prisma.$transaction(async (tx) => {
      await tx.listingBuyerLink.deleteMany({ where: { contactId } });

      await tx.listing.updateMany({
        where: { sellerContactId: contactId, userId: user.id },
        data: { sellerContactId: null },
      });

      await tx.cRMActivity.deleteMany({ where: { contactId, userId: user.id } });
      await tx.activity.deleteMany({ where: { contactId, userId: user.id } });
      await tx.task.deleteMany({ where: { contactId, userId: user.id } });
      await tx.contactNote.deleteMany({ where: { contactId } });

      // PartnerProfile should delete via FK cascade (or explicit delete in schema)
      await tx.contact.delete({ where: { id: contactId } });
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
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
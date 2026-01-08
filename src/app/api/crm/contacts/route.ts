// src/app/api/crm/contacts/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  Prisma,
  ContactStage,
  RelationshipType,
  ClientRole,
} from "@prisma/client";
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

type RelationshipTypeLower = "client" | "partner";
type StageLower = "new" | "warm" | "hot" | "past";
type ClientRoleLower = "buyer" | "seller" | "both";

/* ----------------------------------------------------
 * Enum helpers
 * ---------------------------------------------------*/

const STAGE_MAP: Record<StageLower, ContactStage> = {
  new: ContactStage.NEW,
  warm: ContactStage.WARM,
  hot: ContactStage.HOT,
  past: ContactStage.PAST,
};

function normalizeStage(raw?: string | null): ContactStage | undefined {
  if (!raw) return undefined;
  const v = String(raw).toLowerCase().trim() as StageLower;
  return STAGE_MAP[v];
}

function stageToLower(stage?: ContactStage | null): StageLower | null {
  if (!stage) return null;
  switch (stage) {
    case ContactStage.NEW:
      return "new";
    case ContactStage.WARM:
      return "warm";
    case ContactStage.HOT:
      return "hot";
    case ContactStage.PAST:
      return "past";
    default:
      return "new";
  }
}

function normalizeRelationshipType(
  raw?: string | null
): RelationshipTypeLower | undefined {
  if (!raw) return undefined;
  const v = raw.toLowerCase().trim();
  if (v === "client" || v === "partner") return v;
  return undefined;
}

function normalizeClientRole(raw?: string | null): ClientRole | undefined {
  if (!raw) return undefined;
  const v = raw.toLowerCase().trim() as ClientRoleLower;
  if (v === "buyer") return ClientRole.BUYER;
  if (v === "seller") return ClientRole.SELLER;
  if (v === "both") return ClientRole.BOTH;
  return undefined;
}

function clientRoleToLower(role?: ClientRole | null): ClientRoleLower | null {
  if (!role) return null;
  switch (role) {
    case ClientRole.BUYER:
      return "buyer";
    case ClientRole.SELLER:
      return "seller";
    case ClientRole.BOTH:
      return "both";
    default:
      return null;
  }
}

/* ----------------------------------------------------
 * Normalization helpers
 * ---------------------------------------------------*/

function normalizeLowerTrim(raw?: string | null): string | undefined {
  const v = raw?.toLowerCase().trim();
  return v && v.length > 0 ? v : undefined;
}

function normalizeTrim(raw?: string | null): string | undefined {
  const v = raw?.trim();
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

function shapePartnerProfile(pp: any) {
  if (!pp) return null;
  return {
    businessName: pp.businessName ?? "",
    partnerType: pp.partnerType ?? "",
    coverageMarkets: pp.coverageMarkets ?? "",
    feeComp: pp.feeComp ?? "",
    website: pp.website ?? "",
    profileUrl: pp.profileUrl ?? "",
  };
}

function shapeContact(contactRecord: any, linkedListings: LinkedListing[] = []) {
  const name =
    `${(contactRecord.firstName ?? "").trim()} ${(contactRecord.lastName ?? "").trim()}`.trim() ||
    contactRecord.email ||
    "Unnamed contact";

  const relationshipTypeEnum = (contactRecord.relationshipType ??
    RelationshipType.CLIENT) as RelationshipType;

  const relationshipType: RelationshipTypeLower =
    relationshipTypeEnum === RelationshipType.PARTNER ? "partner" : "client";

  const isPartner = relationshipType === "partner";

  return {
    id: contactRecord.id,
    name,

    relationshipType,

    // Client-only fields (safe defaults)
    label: contactRecord.label ?? "",
    stage: isPartner ? null : stageToLower(contactRecord.stage),
    clientRole: isPartner ? null : clientRoleToLower(contactRecord.clientRole),

    priceRange: contactRecord.priceRange ?? "",
    areas: contactRecord.areas ?? "",
    timeline: contactRecord.timeline ?? "",
    source: contactRecord.source ?? "",

    email: contactRecord.email ?? "",
    phone: contactRecord.phone ?? "",

    // Partner-only
    partnerProfile: isPartner ? shapePartnerProfile(contactRecord.partnerProfile) : null,

    notes: Array.isArray(contactRecord.contactNotes)
      ? contactRecord.contactNotes.map(shapeContactNote)
      : [],

    // Partners never return linked listings
    linkedListings: isPartner ? [] : linkedListings,
  };
}

async function getLinkedListingsForContact(
  prisma: any,
  userId: string,
  contactId: string
): Promise<LinkedListing[]> {
  const linked: LinkedListing[] = [];

  // Seller links (listing.sellerContactId)
  const sellerListings = await prisma.listing.findMany({
    where: { userId, sellerContactId: contactId },
    select: { id: true, address: true, status: true },
  });

  for (const l of sellerListings) {
    linked.push({
      id: l.id,
      address: l.address,
      status: l.status,
      role: "seller",
    });
  }

  // Buyer links (listingBuyerLink)
  const buyerLinks = await prisma.listingBuyerLink.findMany({
    where: {
      contactId,
      listing: { userId },
    },
    select: {
      listing: {
        select: { id: true, address: true, status: true },
      },
    },
  });

  for (const link of buyerLinks) {
    linked.push({
      id: link.listing.id,
      address: link.listing.address,
      status: link.listing.status,
      role: "buyer",
    });
  }

  return linked;
}

/* ----------------------------------------------------
 * GET /api/crm/contacts
 * ---------------------------------------------------*/
export async function GET(req: NextRequest) {
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

    const url = new URL(req.url);
    const includePartners = url.searchParams.get("includePartners") !== "false";

    const contacts = await prisma.contact.findMany({
      where: {
        userId: user.id,
        ...(includePartners ? {} : { relationshipType: RelationshipType.CLIENT }),
      },
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

    const items = contacts.map((c: any) => {
      const isPartner = (c.relationshipType ?? RelationshipType.CLIENT) === RelationshipType.PARTNER;
      return shapeContact(c, isPartner ? [] : linkedByContact[c.id] ?? []);
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
 * ---------------------------------------------------*/

type SaveContactBody = {
  id?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;

  // client-only (accepted as legacy lowercase strings from UI)
  stage?: StageLower | string | null;
  clientRole?: ClientRoleLower | string | null;

  label?: string;
  priceRange?: string;
  areas?: string;
  timeline?: string;
  source?: string;

  relationshipType?: RelationshipTypeLower;

  // partner profile (UI fields)
  businessName?: string;
  partnerType?: string;
  coverageMarkets?: string;
  feeComp?: string;
  website?: string;
  profileUrl?: string;
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
      clientRole,
      label,
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
      profileUrl,
    } = body;

    const normalizedStageEnum = normalizeStage(stage ?? undefined);
    const normalizedClientRoleEnum = normalizeClientRole(clientRole ?? undefined);
    const normalizedSource = normalizeLowerTrim(source ?? undefined);

    const normalizedRelationship = normalizeRelationshipType(relationshipType ?? null);
    const prismaRelationshipEnum: RelationshipType =
      normalizedRelationship === "partner" ? RelationshipType.PARTNER : RelationshipType.CLIENT;

    const partnerProfileTouched =
      "businessName" in body ||
      "partnerType" in body ||
      "coverageMarkets" in body ||
      "feeComp" in body ||
      "website" in body ||
      "profileUrl" in body;

    const partnerProfilePayload = {
      businessName: normalizeTrim(businessName) ?? "",
      partnerType: normalizeTrim(partnerType) ?? "",
      coverageMarkets: normalizeTrim(coverageMarkets) ?? "",
      feeComp: normalizeTrim(feeComp) ?? "",
      website: normalizeTrim(website) ?? "",
      profileUrl: normalizeTrim(profileUrl) ?? "",
    };

    let contactRecord: any = null;

    // -----------------------------
    // UPDATE
    // -----------------------------
    if (id) {
      const existing = await prisma.contact.findFirst({
        where: { id, userId: user.id },
        include: { contactNotes: true, partnerProfile: true },
      });

      if (!existing) {
        return NextResponse.json({ error: "Contact not found." }, { status: 404 });
      }

      const wasPartner =
        (existing.relationshipType ?? RelationshipType.CLIENT) === RelationshipType.PARTNER;

      const willBePartner =
        "relationshipType" in body ? prismaRelationshipEnum === RelationshipType.PARTNER : wasPartner;

      const previousStageEnum: ContactStage | null = wasPartner
        ? null
        : (existing.stage as ContactStage | null) ?? ContactStage.NEW;

      const data: Prisma.ContactUpdateInput = {};

      if ("firstName" in body) data.firstName = body.firstName ?? "";
      if ("lastName" in body) data.lastName = body.lastName ?? "";
      if ("label" in body) data.label = body.label ?? "";
      if ("email" in body) data.email = body.email ?? "";
      if ("phone" in body) data.phone = body.phone ?? "";

      if ("relationshipType" in body) {
        data.relationshipType = prismaRelationshipEnum;
      }

      // ✅ client-only updates
      if (!willBePartner) {
        if ("stage" in body) {
          // allow clearing if stage is explicitly null/invalid
          data.stage = normalizedStageEnum ?? ContactStage.NEW;
        }
        if ("clientRole" in body) {
          data.clientRole = normalizedClientRoleEnum ?? null;
        }
      }

      // ✅ partner-only invariants
      if (willBePartner) {
        data.stage = null;
        data.clientRole = null;

        if (partnerProfileTouched) {
          data.partnerProfile = {
            upsert: {
              create: partnerProfilePayload,
              update: partnerProfilePayload,
            },
          };
        }
      } else {
        // if switching away from partner, we may delete profile in transaction below
        // and do NOT touch partnerProfile otherwise.
      }

      if ("priceRange" in body) data.priceRange = body.priceRange ?? "";
      if ("areas" in body) data.areas = body.areas ?? "";
      if ("timeline" in body) data.timeline = body.timeline ?? "";
      if ("source" in body) data.source = String(body.source ?? "").toLowerCase().trim();

      const becamePartner = !wasPartner && willBePartner;
      const switchedToClient = wasPartner && !willBePartner;

      contactRecord = await prisma.$transaction(async (tx) => {
        // ✅ If converting to PARTNER, unlink from listings (buyers + sellers)
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
              ["Updated contact", (updated.firstName ?? "").trim(), (updated.lastName ?? "").trim()]
                .filter(Boolean)
                .join(" ")
                .trim() || "Updated contact",
            data: {
              relationshipType:
                (updated.relationshipType ?? RelationshipType.CLIENT) === RelationshipType.PARTNER
                  ? "partner"
                  : "client",
            },
          },
        });

        return updated;
      });

      // Trigger stage-change automations (CLIENT only)
      const savedRelationship =
        (contactRecord.relationshipType ?? RelationshipType.CLIENT) as RelationshipType;

      const savedStageEnum: ContactStage | null =
        savedRelationship === RelationshipType.CLIENT
          ? (contactRecord.stage as ContactStage | null) ?? ContactStage.NEW
          : null;

      if (
        savedRelationship === RelationshipType.CLIENT &&
        previousStageEnum &&
        savedStageEnum &&
        previousStageEnum !== savedStageEnum
      ) {
        await processTriggers("LEAD_STAGE_CHANGE", {
          userId: user.id,
          contactId: contactRecord.id,
          listingId: null,
          payload: {
            fromStage: stageToLower(previousStageEnum),
            toStage: stageToLower(savedStageEnum),
          },
        });
      }
    }
    // -----------------------------
    // CREATE
    // -----------------------------
    else {
      const isPartner = prismaRelationshipEnum === RelationshipType.PARTNER;

      const createData: Prisma.ContactCreateInput = {
        user: { connect: { id: user.id } },
        firstName: firstName ?? "",
        lastName: lastName ?? "",
        email: email ?? "",
        phone: phone ?? "",

        relationshipType: prismaRelationshipEnum,

        // ✅ Stage / role rules
        stage: isPartner ? null : normalizedStageEnum ?? ContactStage.NEW,
        clientRole: isPartner ? null : normalizedClientRoleEnum ?? null,

        label: label ?? (isPartner ? "partner" : "new lead"),

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
            relationshipType:
              (contactRecord.relationshipType ?? RelationshipType.CLIENT) === RelationshipType.PARTNER
                ? "partner"
                : "client",
          },
        },
      });

      // Trigger NEW_CONTACT automations (CLIENT only)
      if ((contactRecord.relationshipType ?? RelationshipType.CLIENT) === RelationshipType.CLIENT) {
        await processTriggers("NEW_CONTACT", {
          userId: user.id,
          contactId: contactRecord.id,
          listingId: null,
          payload: {
            stage: stageToLower((contactRecord.stage as ContactStage | null) ?? ContactStage.NEW),
            source: contactRecord.source ?? "",
          },
        });
      }
    }

    const relationship =
  (contactRecord.relationshipType ?? RelationshipType.CLIENT) as RelationshipType;

    const linkedListings =
      relationship === RelationshipType.CLIENT
        ? await getLinkedListingsForContact(prisma, user.id, contactRecord.id)
        : [];

    const shaped = shapeContact(contactRecord, linkedListings);
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

      // PartnerProfile deletes via cascade, but safe to keep explicit too:
      await tx.partnerProfile.deleteMany({ where: { contactId } });

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
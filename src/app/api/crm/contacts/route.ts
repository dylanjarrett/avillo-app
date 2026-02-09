// src/app/api/crm/contacts/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  Prisma,
  ContactStage,
  RelationshipType,
  ClientRole,
} from "@prisma/client";
import { processTriggers } from "@/lib/automations/processTriggers";
import { requireWorkspace } from "@/lib/workspace";
import {
  whereReadableContact,
  whereReadableListing,
  normalizeContactWrite,
  type VisibilityCtx,
} from "@/lib/visibility";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  if (raw == null) return undefined; // allow "field omitted" semantics upstream
  const v = String(raw).toLowerCase().trim();
  if (v === "client" || v === "partner") return v;
  return undefined;
}

function normalizeClientRole(raw?: string | null): ClientRole | undefined {
  if (!raw) return undefined;
  const v = String(raw).toLowerCase().trim() as ClientRoleLower;
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
  const v = String(raw ?? "").toLowerCase().trim();
  return v.length ? v : undefined;
}

function normalizeTrim(raw?: string | null): string | undefined {
  const v = String(raw ?? "").trim();
  return v.length ? v : undefined;
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

  const relationshipEnum = (contactRecord.relationshipType ??
    RelationshipType.CLIENT) as RelationshipType;

  const relationshipType: RelationshipTypeLower =
    relationshipEnum === RelationshipType.PARTNER ? "partner" : "client";

  const isPartner = relationshipType === "partner";

  return {
    id: contactRecord.id,
    name,
    relationshipType,

    // Client-only fields
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

    // IMPORTANT: partners can never have linked listings
    linkedListings: isPartner ? [] : linkedListings,

    pins: Array.isArray(contactRecord.pins)
      ? contactRecord.pins.map((cp: any) => ({
          id: cp.id,
          name: cp.pin?.name ?? "",
          nameKey: cp.pin?.nameKey ?? "",
          attachedAt: cp.createdAt?.toISOString?.() ?? null,
        }))
      : [],
  };
}

/* ----------------------------------------------------
 * Linked listings
 * - Listings are PRIVATE to the user (via whereReadableListing)
 * - Partner contacts NEVER link to listings
 * - Client must be owned by user to attach linked listings
 * ---------------------------------------------------*/

async function getLinkedListingsForOwnedClientContact(
  vctx: VisibilityCtx,
  contactId: string
) {
  const linked: LinkedListing[] = [];

  const [sellerListings, buyerLinks] = await Promise.all([
    prisma.listing.findMany({
      where: {
        ...whereReadableListing(vctx), // ensures listings are private/owned
        sellerContactId: contactId,
      },
      select: { id: true, address: true, status: true },
    }),
    prisma.listingBuyerLink.findMany({
      where: {
        contactId,
        listing: { ...whereReadableListing(vctx) }, // ensures listing is readable
      },
      select: {
        listing: { select: { id: true, address: true, status: true } },
      },
    }),
  ]);

  for (const l of sellerListings) {
    linked.push({ id: l.id, address: l.address, status: l.status, role: "seller" });
  }

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
    const ctx = await requireWorkspace();
    if (!ctx.ok) return NextResponse.json({ contacts: [] }, { status: 200 });

    const vctx: VisibilityCtx = {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      isWorkspaceAdmin: false,
    };

    const url = new URL(req.url);
    const includePartners = url.searchParams.get("includePartners") !== "false";

    const contacts = await prisma.contact.findMany({
      where: {
        ...whereReadableContact(vctx),
        ...(includePartners ? {} : { relationshipType: RelationshipType.CLIENT }),
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      include: {
        contactNotes: true,
        partnerProfile: true,
        pins: { include: { pin: true } },
      },
    });

    const items = await Promise.all(
      contacts.map(async (c: any) => {
        const relationship = (c.relationshipType ??
          RelationshipType.CLIENT) as RelationshipType;

        // Partners NEVER link to listings.
        if (relationship === RelationshipType.PARTNER) {
          return shapeContact(c, []);
        }

        // Clients: only attach linked listings for OWNED contacts
        const isOwner = (c.ownerUserId ?? null) === ctx.userId;
        const linked = isOwner
          ? await getLinkedListingsForOwnedClientContact(vctx, c.id)
          : [];

        return shapeContact(c, linked);
      })
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
 * ---------------------------------------------------*/

type SaveContactBody = {
  id?: string;

  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;

  // client-only
  stage?: StageLower | string | null;
  clientRole?: ClientRoleLower | string | null;

  label?: string;
  priceRange?: string;
  areas?: string;
  timeline?: string;
  source?: string;

  relationshipType?: RelationshipTypeLower | string | null;

  // partner profile
  businessName?: string;
  partnerType?: string;
  coverageMarkets?: string;
  feeComp?: string;
  website?: string;
  profileUrl?: string;
};

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireWorkspace();
    if (!ctx.ok) return NextResponse.json(ctx.error, { status: ctx.status });

    const vctx: VisibilityCtx = {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      isWorkspaceAdmin: false,
    };

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

    // Partner profile touched? (signals partner intent even if relationshipType omitted)
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

    // Relationship patch semantics:
    // - If field omitted => undefined (do NOT default to CLIENT on update)
    // - If provided but invalid/empty => undefined (do NOT change)
    const relationshipPatch: RelationshipTypeLower | undefined =
      "relationshipType" in body
        ? normalizeRelationshipType(relationshipType ?? null)
        : undefined;

    const prismaRelationshipEnum: RelationshipType | undefined =
      relationshipPatch === "partner"
        ? RelationshipType.PARTNER
        : relationshipPatch === "client"
          ? RelationshipType.CLIENT
          : undefined;

    let contactRecord: any = null;

    // -----------------------------
    // UPDATE
    // -----------------------------
    if (id) {
      // Use whereReadableContact so:
      // - clients: only owner can read/update
      // - partners: workspace readable (edit allowed by any workspace member under this route)
      const existing = await prisma.contact.findFirst({
        where: { id, ...whereReadableContact(vctx) },
        include: {
          contactNotes: true,
          partnerProfile: true,
          pins: { include: { pin: true } },
        },
      });

      if (!existing) return NextResponse.json({ error: "Contact not found." }, { status: 404 });

      const wasPartner =
        (existing.relationshipType ?? RelationshipType.CLIENT) ===
        RelationshipType.PARTNER;

      // If partner profile fields are being submitted, infer PARTNER unless explicitly set to CLIENT.
      const inferredPartner =
        partnerProfileTouched && prismaRelationshipEnum !== RelationshipType.CLIENT;

      const willBePartner = inferredPartner
        ? true
        : prismaRelationshipEnum != null
          ? prismaRelationshipEnum === RelationshipType.PARTNER
          : wasPartner;

      const previousStageEnum: ContactStage | null = wasPartner
        ? null
        : (existing.stage as ContactStage | null) ?? ContactStage.NEW;

      // Enforce invariants:
      // - CLIENT contacts always PRIVATE + owned by current user
      // - PARTNER contacts always WORKSPACE + ownerUserId null (or as you allow; helper sets null)
      const normalizedWrite = normalizeContactWrite({
        relationshipType: willBePartner ? RelationshipType.PARTNER : RelationshipType.CLIENT,
        currentUserId: ctx.userId,
      });

      const data: Prisma.ContactUpdateInput = {
        relationshipType: normalizedWrite.relationshipType,
        visibility: normalizedWrite.visibility,
      };

      if (normalizedWrite.ownerUserId) {
        data.ownerUser = { connect: { id: normalizedWrite.ownerUserId } };
      } else if (existing.ownerUserId) {
        data.ownerUser = { disconnect: true };
      }

      if ("firstName" in body) data.firstName = body.firstName ?? "";
      if ("lastName" in body) data.lastName = body.lastName ?? "";
      if ("label" in body) data.label = body.label ?? "";
      if ("email" in body) data.email = body.email ?? "";
      if ("phone" in body) data.phone = body.phone ?? "";

      // Client-only updates
      if (!willBePartner) {
        if ("stage" in body) data.stage = normalizedStageEnum ?? ContactStage.NEW;
        if ("clientRole" in body) data.clientRole = normalizedClientRoleEnum ?? null;
      }

      // Partner-only invariants (no client fields; ensure partner profile)
      if (willBePartner) {
        data.stage = null;
        data.clientRole = null;

        // Ensure partner profile exists/updated when partner fields are touched OR when inferred partner
        if (partnerProfileTouched || inferredPartner) {
          data.partnerProfile = {
            upsert: { create: partnerProfilePayload, update: partnerProfilePayload },
          };
        }
      }

      if ("priceRange" in body) data.priceRange = body.priceRange ?? "";
      if ("areas" in body) data.areas = body.areas ?? "";
      if ("timeline" in body) data.timeline = body.timeline ?? "";
      if ("source" in body) data.source = normalizeLowerTrim(body.source ?? "") ?? "";

      const becamePartner = !wasPartner && willBePartner;

      contactRecord = await prisma.$transaction(async (tx) => {
        // IMPORTANT:
        // Partner contacts cannot be tagged to a listing.
        // So if this contact becomes a partner, forcibly unlink ALL listing associations.
        if (becamePartner) {
          await tx.listingBuyerLink.deleteMany({
            where: { contactId: existing.id, listing: { workspaceId: ctx.workspaceId } },
          });

          await tx.listing.updateMany({
            where: { workspaceId: ctx.workspaceId, sellerContactId: existing.id },
            data: { sellerContactId: null },
          });
        }

        const updated = await tx.contact.update({
          where: { id: existing.id },
          data,
          include: {
            contactNotes: true,
            partnerProfile: true,
            pins: { include: { pin: true } },
          },
        });

        await tx.cRMActivity.create({
          data: {
            workspaceId: ctx.workspaceId,
            actorUserId: ctx.userId,
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
      const savedRelationship = (contactRecord.relationshipType ??
        RelationshipType.CLIENT) as RelationshipType;

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
        await processTriggers(
          "LEAD_STAGE_CHANGE",
          {
            userId: ctx.userId,
            workspaceId: ctx.workspaceId,
            contactId: contactRecord.id,
            listingId: null,
            payload: {
              fromStage: stageToLower(previousStageEnum),
              toStage: stageToLower(savedStageEnum),
            },
          } as any
        );
      }
    }

    // -----------------------------
    // CREATE
    // -----------------------------
    else {
      // Create semantics:
      // - If relationshipType is explicitly partner => partner
      // - Else if partner profile fields were provided => partner
      // - Else => client
      const isPartner =
        prismaRelationshipEnum === RelationshipType.PARTNER ||
        (prismaRelationshipEnum == null && partnerProfileTouched);

      // Enforce invariants on create
      const normalizedWrite = normalizeContactWrite({
        relationshipType: isPartner ? RelationshipType.PARTNER : RelationshipType.CLIENT,
        currentUserId: ctx.userId,
      });

      contactRecord = await prisma.contact.create({
        data: {
          workspace: { connect: { id: ctx.workspaceId } },

          // audit
          createdByUser: { connect: { id: ctx.userId } },

          // enforced invariants
          relationshipType: normalizedWrite.relationshipType,
          visibility: normalizedWrite.visibility,

          ...(normalizedWrite.ownerUserId
            ? { ownerUser: { connect: { id: normalizedWrite.ownerUserId } } }
            : {}),

          firstName: firstName ?? "",
          lastName: lastName ?? "",
          email: email ?? "",
          phone: phone ?? "",

          stage: isPartner ? null : normalizedStageEnum ?? ContactStage.NEW,
          clientRole: isPartner ? null : normalizedClientRoleEnum ?? null,

          label: label ?? (isPartner ? "partner" : "new lead"),
          priceRange: priceRange ?? "",
          areas: areas ?? "",
          timeline: timeline ?? "",
          source: normalizedSource ?? "",

          ...(isPartner
            ? {
                partnerProfile: {
                  create: partnerProfilePayload,
                },
              }
            : {}),
        },
        include: {
          contactNotes: true,
          partnerProfile: true,
          pins: { include: { pin: true } },
        },
      });

      await prisma.cRMActivity.create({
        data: {
          workspaceId: ctx.workspaceId,
          actorUserId: ctx.userId,
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
        await processTriggers(
          "NEW_CONTACT",
          {
            userId: ctx.userId,
            workspaceId: ctx.workspaceId,
            contactId: contactRecord.id,
            listingId: null,
            payload: {
              stage: stageToLower((contactRecord.stage as ContactStage | null) ?? ContactStage.NEW),
              source: contactRecord.source ?? "",
            },
          } as any
        );
      }
    }

    const relationship =
      (contactRecord.relationshipType ?? RelationshipType.CLIENT) as RelationshipType;

    const linkedListings =
      relationship === RelationshipType.CLIENT
        ? await getLinkedListingsForOwnedClientContact(vctx, contactRecord.id)
        : [];

    return NextResponse.json({ contact: shapeContact(contactRecord, linkedListings) });
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
 * - Clients: only owner can delete
 * - Partners: allow delete only if createdByUserId = current user (conservative)
 * ---------------------------------------------------*/
export async function DELETE(req: NextRequest) {
  try {
    const ctx = await requireWorkspace();
    if (!ctx.ok) return NextResponse.json(ctx.error, { status: ctx.status });

    const body = (await req.json().catch(() => null)) as { id?: string } | null;
    if (!body?.id) return NextResponse.json({ error: "Contact id is required." }, { status: 400 });

    const existing = await prisma.contact.findFirst({
      where: {
        id: body.id,
        workspaceId: ctx.workspaceId,
        OR: [
          // client owner
          { ownerUserId: ctx.userId },
          // partner creator (conservative)
          { createdByUserId: ctx.userId },
        ],
      },
      select: { id: true, relationshipType: true },
    });

    if (!existing) return NextResponse.json({ error: "Contact not found." }, { status: 404 });

    const contactId = existing.id;

    await prisma.$transaction(async (tx) => {
      // Always delete listing links for this contact (cleanup)
      await tx.listingBuyerLink.deleteMany({
        where: { contactId, listing: { workspaceId: ctx.workspaceId } },
      });

      await tx.listing.updateMany({
        where: { workspaceId: ctx.workspaceId, sellerContactId: contactId },
        data: { sellerContactId: null },
      });

      await tx.cRMActivity.deleteMany({ where: { contactId, workspaceId: ctx.workspaceId } });
      await tx.activity.deleteMany({ where: { contactId, workspaceId: ctx.workspaceId } });

      await tx.task.deleteMany({ where: { contactId, workspaceId: ctx.workspaceId } });

      await tx.contactNote.deleteMany({ where: { contactId } });
      await tx.partnerProfile.deleteMany({ where: { contactId } });

      await tx.contact.delete({ where: { id: contactId } });
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      console.error("FK constraint when deleting contact:", err);
      return NextResponse.json(
        {
          error:
            "We couldn’t delete this contact because it’s still linked to other records. Remove those links first, or email support@avillo.io.",
        },
        { status: 400 }
      );
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
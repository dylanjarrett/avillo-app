// src/app/api/listings/assign-contact/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";
import { processTriggers } from "@/lib/automations/processTriggers";
import { RelationshipType } from "@prisma/client";
import {
  type VisibilityCtx,
  requireReadableListing,
  requireReadableContact,
  requireReadableForListingBuyerLinkWrite,
} from "@/lib/visibility";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Relationship = "seller" | "buyer";

type Body = {
  listingId?: string;
  contactId?: string;
  relationship?: Relationship;
  role?: string | null; // legacy
};

function isRelationship(v: any): v is Relationship {
  return v === "seller" || v === "buyer";
}

function safeTrim(v: any) {
  const t = String(v ?? "").trim();
  return t.length ? t : "";
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireWorkspace();
    if (!ctx.ok) return NextResponse.json(ctx.error, { status: ctx.status });

    const vctx: VisibilityCtx = {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      isWorkspaceAdmin: false,
    };

    const body = (await req.json().catch(() => null)) as Body | null;
    const listingId = safeTrim(body?.listingId);
    const contactId = safeTrim(body?.contactId);

    if (!listingId || !contactId) {
      return jsonError("listingId and contactId are required.", 400);
    }

    let relationship: Relationship | undefined = body?.relationship;
    let buyerRole: string | null | undefined = body?.role ?? null;

    if (!relationship && isRelationship(body?.role)) {
      relationship = body?.role;
      buyerRole = null;
    }

    if (!relationship || !isRelationship(relationship)) {
      return jsonError("relationship ('seller' | 'buyer') is required (role also accepted).", 400);
    }

    const listing = await requireReadableListing(prisma as any, vctx, listingId, {
      id: true,
      address: true,
      status: true,
      sellerContactId: true,
    });

    const contact = await requireReadableContact(prisma as any, vctx, contactId, {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      relationshipType: true,
    });

    if ((contact.relationshipType ?? RelationshipType.CLIENT) === RelationshipType.PARTNER) {
      return jsonError("Partner contacts can’t be linked to listings.", 400);
    }

    const hadSellerBefore = !!listing.sellerContactId;

    await prisma.$transaction(async (tx) => {
      if (relationship === "seller") {
        await tx.listing.update({
          where: { id: listing.id },
          data: { sellerContactId: contact.id },
        });

        await tx.cRMActivity.create({
          data: {
            workspaceId: ctx.workspaceId,
            actorUserId: ctx.userId,
            contactId: contact.id,
            type: "listing_seller_linked",
            summary:
              `Linked as seller for listing at ${listing.address ?? ""}`.trim() ||
              "Linked as seller to listing",
            data: { listingId: listing.id, address: listing.address, status: listing.status },
          },
        });
      }

      if (relationship === "buyer") {
        await requireReadableForListingBuyerLinkWrite(tx as any, vctx, listing.id, contact.id);

        const existing = await tx.listingBuyerLink.findFirst({
          where: { listingId: listing.id, contactId: contact.id },
          select: { id: true, role: true },
        });

        if (!existing) {
          await tx.listingBuyerLink.create({
            data: {
              listingId: listing.id,
              contactId: contact.id,
              role: buyerRole ?? null,
            },
          });
        } else if (typeof buyerRole !== "undefined") {
          await tx.listingBuyerLink.update({
            where: { id: existing.id },
            data: { role: buyerRole ?? existing.role },
          });
        }

        await tx.cRMActivity.create({
          data: {
            workspaceId: ctx.workspaceId,
            actorUserId: ctx.userId,
            contactId: contact.id,
            type: "listing_buyer_linked",
            summary:
              `Linked as buyer for listing at ${listing.address ?? ""}`.trim() ||
              "Linked as buyer to listing",
            data: {
              listingId: listing.id,
              address: listing.address,
              status: listing.status,
              role: buyerRole ?? null,
            },
          },
        });
      }
    });

    if (relationship === "seller" && !hadSellerBefore) {
      await processTriggers("LISTING_CREATED", {
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
        listingId: listing.id,
        contactId: contact.id,
        payload: { source: "ASSIGN_CONTACT" },
      } as any);
    }

    return NextResponse.json({
      success: true,
      listingId: listing.id,
      contactId: contact.id,
      relationship,
    });
  } catch (err) {
    console.error("listings/assign-contact POST error:", err);
    return NextResponse.json(
      { error: "We couldn’t link this contact to the listing. Try again, or contact support@avillo.io." },
      { status: 500 }
    );
  }
}
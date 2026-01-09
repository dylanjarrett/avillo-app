// src/app/api/listings/unlink-contact/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Relationship = "seller" | "buyer";

type Body = {
  listingId?: string;
  contactId?: string;

  relationship?: Relationship;

  // legacy
  role?: string | null;
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

    const body = (await req.json().catch(() => null)) as Body | null;

    const listingId = safeTrim(body?.listingId);
    const contactId = safeTrim(body?.contactId);

    const relationship: Relationship | undefined =
      body?.relationship && isRelationship(body.relationship)
        ? body.relationship
        : isRelationship(body?.role)
        ? (body?.role as Relationship)
        : undefined;

    if (!listingId || !contactId || !relationship) {
      return jsonError(
        "listingId, contactId, and relationship ('seller' | 'buyer') are required. (role is also accepted.)",
        400
      );
    }

    const listing = await prisma.listing.findFirst({
      where: { id: listingId, workspaceId: ctx.workspaceId },
      select: { id: true, address: true, status: true, sellerContactId: true },
    });
    if (!listing) return jsonError("Listing not found.", 404);

    const contact = await prisma.contact.findFirst({
      where: { id: contactId, workspaceId: ctx.workspaceId },
      select: { id: true },
    });
    if (!contact) return jsonError("Contact not found.", 404);

    await prisma.$transaction(async (tx) => {
      if (relationship === "seller") {
        if (listing.sellerContactId === contact.id) {
          await tx.listing.update({
            where: { id: listing.id },
            data: { sellerContactId: null },
          });

          await tx.cRMActivity.create({
            data: {
              workspaceId: ctx.workspaceId,
              actorUserId: ctx.userId,
              contactId: contact.id,
              type: "listing_seller_unlinked",
              summary:
                `Unlinked as seller for listing at ${listing.address ?? ""}`.trim() ||
                "Unlinked as seller from listing",
              data: { listingId: listing.id, address: listing.address, status: listing.status },
            },
          });
        }
      }

      if (relationship === "buyer") {
        await tx.listingBuyerLink.deleteMany({
          where: { listingId: listing.id, contactId: contact.id },
        });

        await tx.cRMActivity.create({
          data: {
            workspaceId: ctx.workspaceId,
            actorUserId: ctx.userId,
            contactId: contact.id,
            type: "listing_buyer_unlinked",
            summary:
              `Unlinked as buyer for listing at ${listing.address ?? ""}`.trim() ||
              "Unlinked as buyer from listing",
            data: { listingId: listing.id, address: listing.address, status: listing.status },
          },
        });
      }
    });

    return NextResponse.json({ success: true, listingId: listing.id, contactId: contact.id, relationship });
  } catch (err) {
    console.error("listings/unlink-contact POST error:", err);
    return NextResponse.json(
      { error: "We couldn’t unlink this contact from the listing. Try again, or contact support@avillo.io." },
      { status: 500 }
    );
  }
}
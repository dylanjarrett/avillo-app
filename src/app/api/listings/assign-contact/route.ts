// src/app/api/listings/assign-contact/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AssignRelationship = "seller" | "buyer";

type AssignContactBody = {
  listingId?: string;
  contactId?: string;
  relationship?: AssignRelationship;
  // For the original API this was the buyer "role" (primary, backup, etc.)
  // but the new client code is sending role: "seller" | "buyer".
  // We'll normalize both shapes below.
  role?: string | null;
};

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Not authenticated." },
        { status: 401 }
      );
    }

    const rawBody = (await req.json().catch(() => null)) as AssignContactBody | null;

    if (!rawBody?.listingId || !rawBody?.contactId) {
      return NextResponse.json(
        { error: "listingId and contactId are required." },
        { status: 400 }
      );
    }

    const { listingId, contactId } = rawBody;

    // 🔧 Normalize relationship vs role:
    // - If `relationship` is present, trust it.
    // - Else, if `role` is literally "seller" or "buyer", treat that as relationship.
    let relationship: AssignRelationship | undefined = rawBody.relationship;
    let contactRole: string | null | undefined = rawBody.role ?? null;

    if (!relationship && (rawBody.role === "seller" || rawBody.role === "buyer")) {
      relationship = rawBody.role;
      contactRole = null; // no extra buyer role info in this shape
    }

    if (!relationship) {
      return NextResponse.json(
        {
          error:
            "relationship ('seller' | 'buyer') is required, or role must be 'seller' | 'buyer'.",
        },
        { status: 400 }
      );
    }

    const { prisma } = await import("@/lib/prisma");

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Account not found." },
        { status: 404 }
      );
    }

    // Ensure listing belongs to this user
    const listing = await prisma.listing.findFirst({
      where: {
        id: listingId,
        userId: user.id,
      },
    });

    if (!listing) {
      return NextResponse.json(
        { error: "Listing not found." },
        { status: 404 }
      );
    }

    // Ensure contact belongs to this user
    const contact = await prisma.contact.findFirst({
      where: {
        id: contactId,
        userId: user.id,
      },
    });

    if (!contact) {
      return NextResponse.json(
        { error: "Contact not found." },
        { status: 404 }
      );
    }

    /* ------------------------------------
     * Apply relationship
     * -----------------------------------*/

    if (relationship === "seller") {
      // One primary seller per listing – always overwrite
      await prisma.listing.update({
        where: { id: listing.id },
        data: {
          sellerContactId: contact.id,
        },
      });

      await prisma.cRMActivity.create({
        data: {
          userId: user.id,
          contactId: contact.id,
          type: "listing_seller_linked",
          summary:
            `Linked as seller for listing at ${listing.address}`.trim() ||
            "Linked as seller to listing",
          data: {
            listingId: listing.id,
            address: listing.address,
            status: listing.status,
          },
        },
      });
    }

    if (relationship === "buyer") {
      // Allow multiple buyers; don’t duplicate the same contact
      const existingLink = await prisma.listingBuyerLink.findFirst({
        where: {
          listingId: listing.id,
          contactId: contact.id,
        },
      });

      if (!existingLink) {
        await prisma.listingBuyerLink.create({
          data: {
            listingId: listing.id,
            contactId: contact.id,
            role: contactRole ?? null,
          },
        });
      } else if (typeof contactRole !== "undefined") {
        await prisma.listingBuyerLink.update({
          where: { id: existingLink.id },
          data: {
            role: contactRole ?? existingLink.role,
          },
        });
      }

      await prisma.cRMActivity.create({
        data: {
          userId: user.id,
          contactId: contact.id,
          type: "listing_buyer_linked",
          summary:
            `Linked as buyer for listing at ${listing.address}`.trim() ||
            "Linked as buyer to listing",
          data: {
            listingId: listing.id,
            address: listing.address,
            status: listing.status,
            role: contactRole ?? null,
          },
        },
      });
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
      {
        error:
          "We couldn’t link this contact to the listing. Try again, or contact support@avillo.io.",
      },
      { status: 500 }
    );
  }
}

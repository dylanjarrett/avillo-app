// src/app/api/listings/unlink-contact/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UnlinkRelationship = "seller" | "buyer";

type UnlinkContactBody = {
  listingId?: string;
  contactId?: string;
  relationship?: UnlinkRelationship;
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

    const body = (await req.json().catch(() => null)) as UnlinkContactBody | null;

    if (!body?.listingId || !body?.contactId || !body?.relationship) {
      return NextResponse.json(
        {
          error:
            "listingId, contactId, and relationship ('seller' | 'buyer') are required.",
        },
        { status: 400 }
      );
    }

    const { listingId, contactId, relationship } = body;

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

    if (relationship === "seller") {
      // Only clear if this contact is actually the seller
      if (listing.sellerContactId === contact.id) {
        await prisma.listing.update({
          where: { id: listing.id },
          data: {
            sellerContactId: null,
          },
        });

        await prisma.cRMActivity.create({
          data: {
            userId: user.id,
            contactId: contact.id,
            type: "listing_seller_unlinked",
            summary:
              `Unlinked as seller for listing at ${listing.address}`.trim() ||
              "Unlinked as seller from listing",
            data: {
              listingId: listing.id,
              address: listing.address,
              status: listing.status,
            },
          },
        });
      }
    }

    if (relationship === "buyer") {
      await prisma.listingBuyerLink.deleteMany({
        where: {
          listingId: listing.id,
          contactId: contact.id,
        },
      });

      await prisma.cRMActivity.create({
        data: {
          userId: user.id,
          contactId: contact.id,
          type: "listing_buyer_unlinked",
          summary:
            `Unlinked as buyer for listing at ${listing.address}`.trim() ||
            "Unlinked as buyer from listing",
          data: {
            listingId: listing.id,
            address: listing.address,
            status: listing.status,
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
    console.error("listings/unlink-contact POST error:", err);
    return NextResponse.json(
      {
        error:
          "We couldn’t unlink this contact from the listing. Try again, or contact support@avillo.io.",
      },
      { status: 500 }
    );
  }
}
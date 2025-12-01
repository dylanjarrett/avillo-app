// src/app/api/listings/save/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ListingPhotoPayload = {
  id?: string; // kept for future upserts; currently we replace all
  url: string;
  isCover?: boolean;
  sortOrder?: number;
};

type ListingPayload = {
  id?: string;
  address: string;
  mlsId?: string | null;
  price?: number | null;
  status?: string | null; // "draft", "active", "pending", "closed", etc.
  description?: string | null;
  aiCopy?: string | null;
  aiNotes?: string | null;

  // Photos are the only related records handled here
  photos?: ListingPhotoPayload[];
};

type SaveListingBody = {
  listing?: ListingPayload;
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

    const body = (await req.json().catch(() => null)) as SaveListingBody | null;

    if (!body?.listing) {
      return NextResponse.json(
        { error: "Missing listing payload." },
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

    const {
      id,
      address,
      mlsId,
      price,
      status,
      description,
      aiCopy,
      aiNotes,
      photos,
    } = body.listing;

    if (!address || !address.trim()) {
      return NextResponse.json(
        { error: "Address is required to save a listing." },
        { status: 400 }
      );
    }

    /* ------------------------------------
     * CREATE or UPDATE LISTING
     * -----------------------------------*/

    const listingData = {
      address: address.trim(),
      mlsId: mlsId ?? null,
      price: typeof price === "number" ? price : null,
      status: status ?? "draft",
      description: description ?? null,
      aiCopy: aiCopy ?? null,
      aiNotes: aiNotes ?? null,
    };

    let listingId = id;
    let listingRecord;

    if (id) {
      // UPDATE existing listing – ensure it belongs to this user
      const existing = await prisma.listing.findFirst({
        where: {
          id,
          userId: user.id,
        },
      });

      if (!existing) {
        return NextResponse.json(
          { error: "Listing not found." },
          { status: 404 }
        );
      }

      listingRecord = await prisma.listing.update({
        where: { id: existing.id },
        data: {
          ...listingData,
          // userId unchanged
        },
      });

      listingId = listingRecord.id;
    } else {
      // CREATE new listing
      listingRecord = await prisma.listing.create({
        data: {
          ...listingData,
          userId: user.id,
        },
      });

      listingId = listingRecord.id;
    }

    /* ------------------------------------
     * UPDATE LISTING PHOTOS
     * -----------------------------------*/

    if (listingId && photos) {
      // Normalize & clean payload
      const cleaned = photos
        .map((p, index) => ({
          url: p.url?.trim(),
          isCover: !!p.isCover,
          sortOrder:
            typeof p.sortOrder === "number" ? p.sortOrder : index,
        }))
        .filter((p) => !!p.url);

      // Ensure exactly one cover photo if any photos exist
      if (cleaned.length > 0) {
        const hasCover = cleaned.some((p) => p.isCover);
        if (!hasCover) {
          cleaned[0].isCover = true;
        } else {
          let coverSeen = false;
          for (const p of cleaned) {
            if (p.isCover) {
              if (coverSeen) {
                p.isCover = false; // only first stays true
              } else {
                coverSeen = true;
              }
            }
          }
        }

        // Strategy: replace all existing photos for now (simpler & safe)
        await prisma.listingPhoto.deleteMany({
          where: { listingId },
        });

        await prisma.listingPhoto.createMany({
          data: cleaned.map((p) => ({
            listingId,
            url: p.url!,
            isCover: p.isCover,
            sortOrder: p.sortOrder,
          })),
        });
      } else {
        // If client sent empty array, clear photos
        await prisma.listingPhoto.deleteMany({
          where: { listingId },
        });
      }
    }

    /* ------------------------------------
     * RETURN NORMALIZED LISTING (with photos)
     * - Note: relationships (seller/buyers) are read-only here.
     *   They are managed exclusively via assign/unlink endpoints.
     * -----------------------------------*/

    const fullListing = await prisma.listing.findUnique({
      where: { id: listingId! },
      include: {
        seller: true,
        buyers: {
          include: {
            contact: true,
          },
        },
        photos: {
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    if (!fullListing) {
      return NextResponse.json(
        {
          error: "Listing saved, but could not be reloaded.",
        },
        { status: 500 }
      );
    }

    const sellerName = fullListing.seller
      ? `${fullListing.seller.firstName ?? ""} ${
          fullListing.seller.lastName ?? ""
        }`.trim() || fullListing.seller.email || ""
      : null;

    const photoCount = fullListing.photos.length;
    const coverPhoto =
      fullListing.photos.find((p) => p.isCover) ??
      fullListing.photos[0] ??
      null;

    const responsePayload = {
      id: fullListing.id,
      address: fullListing.address,
      mlsId: fullListing.mlsId,
      price: fullListing.price,
      status: fullListing.status,
      description: fullListing.description,
      aiCopy: fullListing.aiCopy,
      aiNotes: fullListing.aiNotes,

      photoCount,
      coverPhotoUrl: coverPhoto ? coverPhoto.url : null,
      photos: fullListing.photos.map((p) => ({
        id: p.id,
        url: p.url,
        isCover: p.isCover,
        sortOrder: p.sortOrder,
      })),

      // Relationships are included for display only
      seller: fullListing.seller
        ? {
            id: fullListing.seller.id,
            name: sellerName,
            email: fullListing.seller.email,
            phone: fullListing.seller.phone,
          }
        : null,

      buyers: fullListing.buyers.map((b) => {
        const c = b.contact;
        const buyerName = c
          ? `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() ||
            c.email ||
            ""
          : "";
        return {
          id: b.id,
          role: b.role,
          contactId: c?.id ?? null,
          contactName: buyerName || null,
        };
      }),

      createdAt: fullListing.createdAt,
      updatedAt: fullListing.updatedAt,
    };

    return NextResponse.json({
      success: true,
      listing: responsePayload,
    });
  } catch (err) {
    console.error("listings/save POST error:", err);
    return NextResponse.json(
      {
        error:
          "We couldn’t save your listing. Try again, or contact support@avillo.io.",
      },
      { status: 500 }
    );
  }
}
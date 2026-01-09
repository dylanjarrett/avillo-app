// src/app/api/listings/save/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";
import { processTriggers } from "@/lib/automations/processTriggers";
import type { AutomationContext } from "@/lib/automations/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ListingPhotoPayload = {
  id?: string;
  url: string;
  isCover?: boolean;
  sortOrder?: number;
};

type ListingPayload = {
  id?: string;
  address: string;
  mlsId?: string | null;
  price?: number | null;
  status?: string | null;
  description?: string | null;
  aiCopy?: string | null;
  aiNotes?: string | null;
  photos?: ListingPhotoPayload[];
};

type SaveListingBody = {
  listing?: ListingPayload;
};

function normalizeStatus(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const v = String(raw).toLowerCase().trim();
  return v.length ? v : undefined;
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireWorkspace();
    if (!ctx.ok) return NextResponse.json(ctx.error, { status: ctx.status });

    const body = (await req.json().catch(() => null)) as SaveListingBody | null;
    if (!body?.listing) return NextResponse.json({ error: "Missing listing payload." }, { status: 400 });

    const { id, address, mlsId, price, status, description, aiCopy, aiNotes, photos } = body.listing;

    if (!address || !address.trim()) {
      return NextResponse.json({ error: "Address is required to save a listing." }, { status: 400 });
    }

    const isNewListing = !id;

    const baseListingData = {
      address: address.trim(),
      mlsId: mlsId ?? null,
      price: typeof price === "number" ? price : null,
      description: description ?? null,
      aiCopy: aiCopy ?? null,
      aiNotes: aiNotes ?? null,
    };

    const incomingStatus = normalizeStatus(status);

    let listingId = id;
    let listingRecord: any;

    if (id) {
      const existing = await prisma.listing.findFirst({
        where: { id, workspaceId: ctx.workspaceId },
      });
      if (!existing) return NextResponse.json({ error: "Listing not found." }, { status: 404 });

      const previousStatus = normalizeStatus(existing.status) ?? "draft";

      listingRecord = await prisma.listing.update({
        where: { id: existing.id },
        data: {
          ...baseListingData,
          status: incomingStatus ?? previousStatus,
        },
      });

      listingId = listingRecord.id;

      const newStatus = normalizeStatus(listingRecord.status) ?? "draft";

      if (previousStatus !== newStatus) {
        try {
          const triggerContext: AutomationContext = {
            userId: ctx.userId,
            workspaceId: ctx.workspaceId,
            contactId: listingRecord.sellerContactId ?? null,
            listingId: listingRecord.id,
            trigger: "LISTING_STAGE_CHANGE",
            payload: { source: "listings/save", fromStatus: previousStatus, toStatus: newStatus },
          } as any;

          await processTriggers("LISTING_STAGE_CHANGE", triggerContext);
        } catch (err) {
          console.error("[listings/save] LISTING_STAGE_CHANGE trigger error:", err);
        }
      }
    } else {
      const createStatus = incomingStatus ?? "draft";

      listingRecord = await prisma.listing.create({
        data: {
          ...baseListingData,
          status: createStatus,
          workspaceId: ctx.workspaceId,
          createdByUserId: ctx.userId,
        },
      });

      listingId = listingRecord.id;
    }

    /* ------------------------------------
     * UPDATE LISTING PHOTOS (safe via listingId)
     * -----------------------------------*/
    if (listingId && typeof photos !== "undefined") {
      const cleaned = Array.isArray(photos)
        ? photos
            .map((p, index) => ({
              url: String(p.url ?? "").trim(),
              isCover: !!p.isCover,
              sortOrder: typeof p.sortOrder === "number" ? p.sortOrder : index,
            }))
            .filter((p) => !!p.url)
        : [];

      if (cleaned.length > 0) {
        const hasCover = cleaned.some((p) => p.isCover);
        if (!hasCover) cleaned[0].isCover = true;
        else {
          let coverSeen = false;
          for (const p of cleaned) {
            if (p.isCover) {
              if (coverSeen) p.isCover = false;
              else coverSeen = true;
            }
          }
        }

        await prisma.listingPhoto.deleteMany({ where: { listingId } });

        await prisma.listingPhoto.createMany({
          data: cleaned.map((p) => ({
            listingId,
            url: p.url!,
            isCover: p.isCover,
            sortOrder: p.sortOrder,
          })),
        });
      } else {
        await prisma.listingPhoto.deleteMany({ where: { listingId } });
      }
    }

    /* ------------------------------------
     * Reload listing (workspace boundary enforced)
     * -----------------------------------*/
    const fullListing = await prisma.listing.findFirst({
      where: { id: listingId!, workspaceId: ctx.workspaceId },
      include: {
        seller: true,
        buyers: { include: { contact: true } },
        photos: { orderBy: { sortOrder: "asc" } },
      },
    });

    if (!fullListing) {
      return NextResponse.json({ error: "Listing saved, but could not be reloaded." }, { status: 500 });
    }

    const sellerName = fullListing.seller
      ? `${fullListing.seller.firstName ?? ""} ${fullListing.seller.lastName ?? ""}`.trim() ||
        fullListing.seller.email ||
        ""
      : null;

    const coverPhoto = fullListing.photos.find((p) => p.isCover) ?? fullListing.photos[0] ?? null;

    const responsePayload = {
      id: fullListing.id,
      address: fullListing.address,
      mlsId: fullListing.mlsId,
      price: fullListing.price,
      status: fullListing.status,
      description: fullListing.description,
      aiCopy: fullListing.aiCopy,
      aiNotes: fullListing.aiNotes,

      photoCount: fullListing.photos.length,
      coverPhotoUrl: coverPhoto ? coverPhoto.url : null,
      photos: fullListing.photos.map((p) => ({
        id: p.id,
        url: p.url,
        isCover: p.isCover,
        sortOrder: p.sortOrder,
      })),

      seller: fullListing.seller
        ? { id: fullListing.seller.id, name: sellerName, email: fullListing.seller.email, phone: fullListing.seller.phone }
        : null,

      buyers: fullListing.buyers.map((b) => {
        const c = b.contact;
        const buyerName = c ? `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || c.email || "" : "";
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

    /* ------------------------------------
     * Fire LISTING_CREATED (only if new + has seller)
     * -----------------------------------*/
    if (isNewListing && fullListing.sellerContactId) {
      try {
        const triggerContext: AutomationContext = {
          userId: ctx.userId,
          workspaceId: ctx.workspaceId,
          contactId: fullListing.sellerContactId,
          listingId: fullListing.id,
          trigger: "LISTING_CREATED",
          payload: {
            source: "listings/save",
            address: fullListing.address,
            status: normalizeStatus(fullListing.status) ?? "draft",
          },
        } as any;

        await processTriggers("LISTING_CREATED", triggerContext);
      } catch (err) {
        console.error("[listings/save] LISTING_CREATED trigger error:", err);
      }
    }

    return NextResponse.json({ success: true, listing: responsePayload });
  } catch (err) {
    console.error("listings/save POST error:", err);
    return NextResponse.json(
      { error: "We couldn’t save your listing. Try again, or contact support@avillo.io." },
      { status: 500 }
    );
  }
}
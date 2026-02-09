// src/app/api/listings/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";
import {
  whereReadableListing,
  type VisibilityCtx,
  gateVisibility,
} from "@/lib/visibility";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeLower(v: any) {
  return String(v ?? "").toLowerCase().trim();
}

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireWorkspace();
    if (!ctx.ok) return NextResponse.json(ctx.error, { status: ctx.status });

    const vctx: VisibilityCtx = {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      isWorkspaceAdmin: false,
    };

    const url = new URL(req.url);
    const statusParam = safeLower(url.searchParams.get("status"));
    const q = safeLower(url.searchParams.get("q"));

    const statusFilter = statusParam && statusParam !== "all" ? statusParam : undefined;

    const listings = await prisma.listing.findMany({
      where: {
        ...whereReadableListing(vctx),
        ...(statusFilter ? { status: statusFilter } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: {
        seller: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            visibility: true,
            ownerUserId: true,
          },
        },
        buyers: {
          where: {
            contact: {
              // avoid leaking private contacts that are not readable
              ...(gateVisibility({ ctx: vctx }) as any),
              workspaceId: ctx.workspaceId,
            },
          },
          include: {
            contact: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                visibility: true,
                ownerUserId: true,
              },
            },
          },
        },
        photos: { orderBy: { sortOrder: "asc" } },
      },
      take: 500,
    });

    const filtered = listings.filter((l) => {
      if (!q) return true;
      const haystack = [
        l.address,
        l.mlsId ?? "",
        l.description ?? "",
        l.seller ? `${l.seller.firstName ?? ""} ${l.seller.lastName ?? ""}` : "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });

    const payload = filtered.map((l) => {
      const sellerReadable =
        !l.seller
          ? false
          : vctx.isWorkspaceAdmin
            ? true
            : l.seller.visibility === "WORKSPACE" ||
              (l.seller.visibility === "PRIVATE" && l.seller.ownerUserId === ctx.userId);

      const sellerName =
        l.seller && sellerReadable
          ? `${l.seller.firstName ?? ""} ${l.seller.lastName ?? ""}`.trim() || l.seller.email || ""
          : null;

      const coverPhoto = l.photos.find((p) => p.isCover) ?? l.photos[0] ?? null;

      return {
        id: l.id,
        address: l.address,
        mlsId: l.mlsId,
        price: l.price,
        status: l.status,
        description: l.description,
        aiCopy: l.aiCopy,
        aiNotes: l.aiNotes,

        photoCount: l.photos.length,
        coverPhotoUrl: coverPhoto ? coverPhoto.url : null,
        photos: l.photos.map((p) => ({
          id: p.id,
          url: p.url,
          isCover: p.isCover,
          sortOrder: p.sortOrder,
        })),

        seller:
          l.seller && sellerReadable
            ? {
                id: l.seller.id,
                name: sellerName,
                email: l.seller.email,
                phone: l.seller.phone,
              }
            : null,

        buyers: l.buyers.map((b) => {
          const c = b.contact;
          const buyerName = c
            ? `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || c.email || ""
            : "";
          return {
            id: b.id,
            role: b.role,
            contactId: c?.id ?? null,
            contactName: buyerName || null,
          };
        }),

        createdAt: l.createdAt,
        updatedAt: l.updatedAt,
      };
    });

    return NextResponse.json({ success: true, listings: payload });
  } catch (err) {
    console.error("listings GET error:", err);
    return NextResponse.json(
      { error: "We couldn’t load your listings. Try again, or contact support@avillo.io." },
      { status: 500 }
    );
  }
}
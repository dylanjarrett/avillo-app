// src/app/api/listings/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Not authenticated." },
        { status: 401 }
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

    const url = new URL(req.url);
    const statusParam = url.searchParams.get("status"); // e.g. "active", "draft", "closed"
    const q = url.searchParams.get("q")?.trim().toLowerCase() || "";

    // Map "active" → not draft/closed, etc. (simple starter logic)
    let statusFilter: string | undefined;
    if (statusParam && statusParam !== "all") {
      statusFilter = statusParam;
    }

    const listings = await prisma.listing.findMany({
      where: {
        userId: user.id,
        ...(statusFilter ? { status: statusFilter } : {}),
      },
      orderBy: { createdAt: "desc" },
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

    const filtered = listings.filter((l) => {
      if (!q) return true;
      const haystack = [
        l.address,
        l.mlsId ?? "",
        l.description ?? "",
        l.seller
          ? `${l.seller.firstName ?? ""} ${l.seller.lastName ?? ""}`
          : "",
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });

    const payload = filtered.map((l) => {
      const sellerName = l.seller
        ? `${l.seller.firstName ?? ""} ${l.seller.lastName ?? ""}`.trim() ||
          l.seller.email ||
          ""
        : null;

      const photoCount = l.photos.length;
      const coverPhoto =
        l.photos.find((p) => p.isCover) ?? l.photos[0] ?? null;

      return {
        id: l.id,
        address: l.address,
        mlsId: l.mlsId,
        price: l.price,
        status: l.status,
        description: l.description,
        aiCopy: l.aiCopy,
        aiNotes: l.aiNotes,

        // ---- NEW: photos for gallery + workspace ----
        photoCount,
        coverPhotoUrl: coverPhoto ? coverPhoto.url : null,
        photos: l.photos.map((p) => ({
          id: p.id,
          url: p.url,
          isCover: p.isCover,
          sortOrder: p.sortOrder,
        })),

        seller: l.seller
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

        createdAt: l.createdAt,
        updatedAt: l.updatedAt,
      };
    });

    return NextResponse.json({
      success: true,
      listings: payload,
    });
  } catch (err) {
    console.error("listings GET error:", err);
    return NextResponse.json(
      {
        error:
          "We couldn’t load your listings. Try again, or contact support@avillo.io.",
      },
      { status: 500 }
    );
  }
}
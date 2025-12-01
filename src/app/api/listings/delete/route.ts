// src/app/api/listings/delete/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Not authenticated." },
        { status: 401 }
      );
    }

    const { id } = await req.json().catch(() => ({} as { id?: string }));

    if (!id) {
      return NextResponse.json(
        { error: "Missing listing id." },
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

    const listing = await prisma.listing.findFirst({
      where: { id, userId: user.id },
    });

    if (!listing) {
      return NextResponse.json(
        { error: "Listing not found." },
        { status: 404 }
      );
    }

    // Clean up related rows so CRM views stay accurate
    await prisma.listingBuyerLink.deleteMany({
      where: { listingId: listing.id },
    });

    await prisma.listingPhoto.deleteMany({
      where: { listingId: listing.id },
    });

    await prisma.listing.delete({
      where: { id: listing.id },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("delete listing error", err);
    return NextResponse.json(
      { error: "Failed to delete listing." },
      { status: 500 }
    );
  }
}
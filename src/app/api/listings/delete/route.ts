import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma"; // keep your existing prisma import path

export async function POST(req: NextRequest) {
  try {
    const { id } = await req.json();

    if (!id) {
      return NextResponse.json(
        { error: "Missing listing id." },
        { status: 400 }
      );
    }

    // If you have related tables (photos, buyers, etc.)
    // and they are NOT set to cascade in the DB, delete them here first:
    //
    // await prisma.listingPhoto.deleteMany({ where: { listingId: id } });
    // await prisma.listingBuyer.deleteMany({ where: { listingId: id } });
    //
    // Otherwise, rely on ON DELETE CASCADE and just delete the listing.

    await prisma.listing.delete({
      where: { id },
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
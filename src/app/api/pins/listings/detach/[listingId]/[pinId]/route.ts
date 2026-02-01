//api/pins/listings/detach/[listingId]/[pinId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { listingId: string; pinId: string } }
) {
  try {
    const ctx = await requireWorkspace();
    if (!ctx.ok) return NextResponse.json(ctx.error, { status: ctx.status });

    const listingId = params?.listingId;
    const pinId = params?.pinId;

    if (!listingId) return NextResponse.json({ error: "Listing id is required." }, { status: 400 });
    if (!pinId) return NextResponse.json({ error: "Pin id is required." }, { status: 400 });

    // Ensure both belong to workspace
    const [listing, pin] = await Promise.all([
      prisma.listing.findFirst({
        where: { id: listingId, workspaceId: ctx.workspaceId },
        select: { id: true },
      }),
      prisma.pin.findFirst({
        where: { id: pinId, workspaceId: ctx.workspaceId },
        select: { id: true },
      }),
    ]);

    if (!listing) return NextResponse.json({ error: "Listing not found." }, { status: 404 });
    if (!pin) return NextResponse.json({ error: "Pin not found." }, { status: 404 });

    await prisma.listingPin.deleteMany({
      where: { workspaceId: ctx.workspaceId, listingId, pinId },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("api/pins/listings/detach/[listingId]/[pinId] DELETE error:", err);
    return NextResponse.json(
      { error: "We couldn’t remove this pin. Try again, or email support@avillo.io if it continues." },
      { status: 500 }
    );
  }
}
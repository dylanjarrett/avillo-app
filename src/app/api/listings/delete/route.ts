// src/app/api/listings/delete/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";
import { type VisibilityCtx, requireReadableListing } from "@/lib/visibility";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

    const vctx: VisibilityCtx = {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      isWorkspaceAdmin: false,
    };

    const payload = (await req.json().catch(() => null)) as { id?: string } | null;
    const id = safeTrim(payload?.id);
    if (!id) return jsonError("Missing listing id.", 400);

    const listing = await requireReadableListing(prisma as any, vctx, id, { id: true });

    await prisma.$transaction(async (tx) => {
      await tx.listingBuyerLink.deleteMany({ where: { listingId: listing.id } });
      await tx.listingPhoto.deleteMany({ where: { listingId: listing.id } });

      try {
        await tx.cRMActivity.deleteMany({
          where: {
            workspaceId: ctx.workspaceId,
            data: { path: ["listingId"], equals: listing.id },
          } as any,
        });
      } catch (e) {
        console.warn("cRMActivity JSON-path delete skipped:", e);
      }

      await tx.task.deleteMany({ where: { workspaceId: ctx.workspaceId, listingId: listing.id } });
      await tx.activity.deleteMany({ where: { workspaceId: ctx.workspaceId, listingId: listing.id } });

      await tx.listing.delete({ where: { id: listing.id } });
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("listings/delete POST error:", err);
    return NextResponse.json({ error: "Failed to delete listing." }, { status: 500 });
  }
}
// 1) src/app/api/intelligence/history/[id]/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";
import { whereReadableIntelligenceOutput, type VisibilityCtx } from "@/lib/visibility";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireWorkspace();
    if (!ctx.ok) return NextResponse.json(ctx.error, { status: ctx.status });

    const id = params?.id;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const vctx: VisibilityCtx = {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      isWorkspaceAdmin: false,
    };

    // Must be readable under visibility rules (prevents deleting others' PRIVATE outputs)
    const existing = await prisma.intelligenceOutput.findFirst({
      where: { id, ...whereReadableIntelligenceOutput(vctx) },
      select: { id: true },
    });

    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.intelligenceOutput.delete({ where: { id: existing.id } });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error("Intelligence delete history error", err);
    return NextResponse.json({ error: "Failed to delete history entry" }, { status: 500 });
  }
}
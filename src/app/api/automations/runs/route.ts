import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireEntitlement } from "@/lib/entitlements";
import { requireWorkspace } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  const ctx = await requireWorkspace();
  if (!ctx.ok) return NextResponse.json([], { status: 200 });

  const gate = await requireEntitlement(ctx.userId, "AUTOMATIONS_READ");
  if (!gate.ok) return NextResponse.json([], { status: 200 });

  const runs = await prisma.automationRun.findMany({
    where: { workspaceId: ctx.workspaceId },
    include: { steps: true, automation: { select: { id: true, name: true } } },
    orderBy: { executedAt: "desc" },
    take: 100,
  });

  return NextResponse.json(runs);
}
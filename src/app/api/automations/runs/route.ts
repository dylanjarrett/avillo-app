//api/automations/runs/route
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireEntitlement } from "@/lib/entitlements";
import { requireWorkspace } from "@/lib/workspace";
import {
  whereReadableAutomation,
  type VisibilityCtx,
} from "@/lib/visibility";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  const ctx = await requireWorkspace();
  if (!ctx.ok) return NextResponse.json(ctx.error, { status: ctx.status });

  const vctx: VisibilityCtx = {
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    isWorkspaceAdmin: false,
  };  

  const gate = await requireEntitlement(ctx.workspaceId, "AUTOMATIONS_READ");
  if (!gate.ok) return NextResponse.json([], { status: 200 });

  const runs = await prisma.automationRun.findMany({
    where: {
      workspaceId: ctx.workspaceId,
      automation: whereReadableAutomation(vctx),
    },
    include: { steps: true, automation: { select: { id: true, name: true } } },
    orderBy: { executedAt: "desc" },
    take: 100,
  });

  return NextResponse.json(runs);
}
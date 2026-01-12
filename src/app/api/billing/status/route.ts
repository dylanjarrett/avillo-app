import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await requireWorkspace();
  if (!ctx.ok) return NextResponse.json(ctx.error, { status: ctx.status });

  const ws = await prisma.workspace.findUnique({
    where: { id: ctx.workspaceId },
    select: {
      id: true,
      name: true,
      type: true,

      accessLevel: true,
      plan: true,
      subscriptionStatus: true,
      trialEndsAt: true,
      currentPeriodEnd: true,

      stripeCustomerId: true,
      stripeSubscriptionId: true,
      stripeBasePriceId: true,
      stripeSeatPriceId: true,

      seatLimit: true,
      includedSeats: true,

      _count: { select: { members: true } },
    },
  });

  if (!ws) return NextResponse.json({ error: "Workspace not found." }, { status: 404 });

  return NextResponse.json({
    workspace: {
      ...ws,
      seatsUsed: ws._count.members,
    },
  });
}
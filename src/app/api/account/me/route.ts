// src/app/api/account/me/route.ts
import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace";
import { getEntitlementsForWorkspaceId } from "@/lib/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(json: any, status = 200) {
  return NextResponse.json(json, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

export async function GET() {
  try {
    const ctx = await requireWorkspace();
    if (!ctx.ok) return noStore(ctx.error, ctx.status);

    const { userId, workspaceId, workspaceRole } = ctx;

    const { prisma } = await import("@/lib/prisma");

    const [user, workspace, usedSeats, pendingInvites] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          brokerage: true,
          phone: true,
          defaultWorkspaceId: true,
          createdAt: true,
        },
      }),
      prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: {
          id: true,
          name: true,
          type: true,

          // Billing source-of-truth
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

          createdByUserId: true,
          createdAt: true,
        },
      }),
      prisma.workspaceUser.count({
        where: { workspaceId, removedAt: null },
      }),
      prisma.workspaceInvite.count({
        where: {
          workspaceId,
          status: "PENDING",
          expiresAt: { gt: new Date() },
        },
      }),
    ]);

    if (!user) return noStore({ error: "Account not found" }, 404);
    if (!workspace) return noStore({ error: "Workspace not found" }, 404);

    const entitlements = await getEntitlementsForWorkspaceId(workspaceId);

    const seatUsage = {
      usedSeats,
      pendingInvites,
      seatLimit: workspace.seatLimit,
      includedSeats: workspace.includedSeats,
      remaining: Math.max(0, workspace.seatLimit - usedSeats - pendingInvites),
    };

    return noStore({
      ok: true,
      user: {
        id: user.id,
        name: user.name ?? "",
        email: user.email,
        role: user.role, // platform role (USER/ADMIN)
        brokerage: user.brokerage ?? "",
        phone: user.phone ?? "",
        defaultWorkspaceId: user.defaultWorkspaceId ?? null,
        createdAt: user.createdAt,
      },
      workspace: {
        id: workspace.id,
        name: workspace.name,
        type: workspace.type,
        role: workspaceRole, // OWNER / ADMIN / AGENT (membership)
        createdByUserId: workspace.createdByUserId ?? null,
        createdAt: workspace.createdAt,

        billing: {
          accessLevel: workspace.accessLevel,
          plan: workspace.plan,
          subscriptionStatus: workspace.subscriptionStatus,
          trialEndsAt: workspace.trialEndsAt,
          currentPeriodEnd: workspace.currentPeriodEnd,
          stripeCustomerId: workspace.stripeCustomerId ?? null,
          stripeSubscriptionId: workspace.stripeSubscriptionId ?? null,
          stripeBasePriceId: workspace.stripeBasePriceId ?? null,
          stripeSeatPriceId: workspace.stripeSeatPriceId ?? null,
        },
      },
      seatUsage,
      entitlements,
    });
  } catch (err) {
    console.error("/api/account/me GET error:", err);
    return NextResponse.json({ error: "Failed to load account" }, { status: 500 });
  }
}

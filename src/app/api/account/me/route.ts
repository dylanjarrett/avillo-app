// src/app/api/account/me/route.ts
import { NextResponse } from "next/server";
import { getEntitlementsForUserId } from "@/lib/entitlements";
import { requireWorkspace } from "@/lib/workspace"; // <-- adjust path if yours differs

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // ✅ Centralized auth + workspace guard
    const ctx = await requireWorkspace();
    if (!ctx.ok) return NextResponse.json(ctx.error, { status: ctx.status });

    const { userId, workspaceId, workspaceRole } = ctx;

    // Lazy-import Prisma (keeps it out of build-time evaluation / edge confusion)
    const { prisma } = await import("@/lib/prisma");

    // User (platform-wide billing + access live here)
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,

        accessLevel: true,
        plan: true,
        subscriptionStatus: true,

        trialEndsAt: true,
        currentPeriodEnd: true,

        // optional debug/support fields
        stripeCustomerId: true,
        stripeSubscriptionId: true,
        stripePriceId: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    // Workspace (tenant context)
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, name: true, ownerId: true },
    });

    // Entitlements (you can later evolve this to be workspace-aware if desired)
    const entitlements = await getEntitlementsForUserId(userId);

    return NextResponse.json(
      {
        user: {
          id: user.id,
          name: user.name ?? "",
          email: user.email,
          role: user.role,

          accessLevel: user.accessLevel,
          plan: user.plan,
          subscriptionStatus: user.subscriptionStatus,

          trialEndsAt: user.trialEndsAt,
          currentPeriodEnd: user.currentPeriodEnd,
        },
        workspace: workspace
          ? {
              id: workspace.id,
              name: workspace.name,
              ownerId: workspace.ownerId,
              role: workspaceRole, // OWNER / ADMIN / AGENT
            }
          : null,
        entitlements,
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (err) {
    console.error("/api/account/me GET error:", err);
    return NextResponse.json({ error: "Failed to load account" }, { status: 500 });
  }
}
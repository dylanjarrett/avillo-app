// src/app/api/admin/users/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { UserRole, WorkspaceRole } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  const email = String(session?.user?.email || "").trim().toLowerCase();

  if (!email) {
    return { ok: false as const, res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { prisma } = await import("@/lib/prisma");

  const dbUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true },
  });

  if (!dbUser || dbUser.role !== "ADMIN") {
    return { ok: false as const, res: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { ok: true as const, adminId: dbUser.id };
}

function toIso(d: Date | null | undefined) {
  return d ? d.toISOString() : null;
}

function buildUserPayload(u: any) {
  const memberships =
    (u.workspaceMemberships || []).map((wm: any) => ({
      workspaceId: wm.workspace?.id as string,
      workspaceName: (wm.workspace?.name as string) ?? "Untitled workspace",
      workspaceCreatedAt: wm.workspace?.createdAt ? new Date(wm.workspace.createdAt).toISOString() : null,
      role: wm.role as WorkspaceRole,
      joinedAt: toIso(wm.joinedAt ?? wm.createdAt ?? null),

      // Billing now lives here:
      workspaceAccessLevel: wm.workspace?.accessLevel ?? null,
      workspacePlan: wm.workspace?.plan ?? null,
      workspaceSubscriptionStatus: wm.workspace?.subscriptionStatus ?? null,
      workspaceTrialEndsAt: toIso(wm.workspace?.trialEndsAt ?? null),
      workspaceCurrentPeriodEnd: toIso(wm.workspace?.currentPeriodEnd ?? null),
      stripeCustomerId: wm.workspace?.stripeCustomerId ?? null,
      stripeSubscriptionId: wm.workspace?.stripeSubscriptionId ?? null,
      stripeBasePriceId: wm.workspace?.stripeBasePriceId ?? null,
    })) ?? [];

  return {
    id: u.id,
    name: u.name ?? "",
    email: u.email,
    brokerage: u.brokerage ?? "",
    role: u.role as UserRole,
    defaultWorkspaceId: u.defaultWorkspaceId ?? null,

    openAITokensUsed: u.openAITokensUsed ?? 0,
    lastLoginAt: toIso(u.lastLoginAt ?? null),
    createdAt: u.createdAt.toISOString(),

    workspaceCount: memberships.length,
    memberships,
  };
}

// GET all users (with workspace memberships + workspace billing)
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  try {
    const { prisma } = await import("@/lib/prisma");

    const users = await prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        brokerage: true,
        role: true,
        defaultWorkspaceId: true,
        openAITokensUsed: true,
        lastLoginAt: true,
        createdAt: true,
        workspaceMemberships: {
          orderBy: { createdAt: "asc" },
          select: {
            role: true,
            joinedAt: true,
            createdAt: true,
            workspace: {
              select: {
                id: true,
                name: true,
                createdAt: true,

                accessLevel: true,
                plan: true,
                subscriptionStatus: true,
                trialEndsAt: true,
                currentPeriodEnd: true,
                stripeCustomerId: true,
                stripeSubscriptionId: true,
                stripeBasePriceId: true,
              },
            },
          },
        },
      },
    });

    return NextResponse.json({ ok: true, users: users.map(buildUserPayload) });
  } catch (err) {
    console.error("Admin GET users error:", err);
    return NextResponse.json({ error: "Failed to load users" }, { status: 500 });
  }
}

/**
 * PATCH
 * - Update platform user role (ADMIN/USER)
 * - Run workspace billing actions (grant beta, expire, grant founding pro, etc.)
 */
export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  try {
    const { prisma } = await import("@/lib/prisma");

    const body = await req.json().catch(() => ({}));
    const userId = String(body?.userId || "");

    if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

    // Load user's default workspace for convenience
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, defaultWorkspaceId: true },
    });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const workspaceId =
      String(body?.workspaceId || "") || String(user.defaultWorkspaceId || "");

    // Optional: update platform user role
    if (body?.role) {
      const role = String(body.role);
      if (!Object.values(UserRole).includes(role as any)) {
        return NextResponse.json({ error: "Invalid role" }, { status: 400 });
      }
      await prisma.user.update({ where: { id: userId }, data: { role: role as any } });
    }

    const action = String(body?.action || "");

    // If action targets workspace billing, require a workspaceId
    const needsWorkspace =
      action === "GRANT_BETA" ||
      action === "EXPIRE_ACCESS" ||
      action === "GRANT_FOUNDING_PRO" ||
      action === "GRANT_PRO" ||
      action === "GRANT_STARTER";

    if (needsWorkspace && !workspaceId) {
      return NextResponse.json(
        { error: "Missing workspaceId (and user has no defaultWorkspaceId)." },
        { status: 400 }
      );
    }

    // Workspace billing actions
    if (action && needsWorkspace) {
      if (action === "GRANT_BETA") {
        await prisma.workspace.update({
          where: { id: workspaceId },
          data: {
            accessLevel: "BETA" as any,
            subscriptionStatus: "NONE" as any,
          } as any,
        });
      }

      if (action === "EXPIRE_ACCESS") {
        await prisma.workspace.update({
          where: { id: workspaceId },
          data: { accessLevel: "EXPIRED" as any } as any,
        });
      }

      if (action === "GRANT_FOUNDING_PRO") {
        await prisma.workspace.update({
          where: { id: workspaceId },
          data: {
            accessLevel: "PAID" as any,
            plan: "FOUNDING_PRO" as any,
            subscriptionStatus: "ACTIVE" as any,
            trialEndsAt: null,
            currentPeriodEnd: null,
          } as any,
        });
      }

      if (action === "GRANT_PRO") {
        await prisma.workspace.update({
          where: { id: workspaceId },
          data: {
            accessLevel: "PAID" as any,
            plan: "PRO" as any,
            subscriptionStatus: "ACTIVE" as any,
          } as any,
        });
      }

      if (action === "GRANT_STARTER") {
        await prisma.workspace.update({
          where: { id: workspaceId },
          data: {
            accessLevel: "PAID" as any,
            plan: "STARTER" as any,
            subscriptionStatus: "ACTIVE" as any,
          } as any,
        });
      }
    }

    // Return refreshed user payload
    const refreshed = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        brokerage: true,
        role: true,
        defaultWorkspaceId: true,
        openAITokensUsed: true,
        lastLoginAt: true,
        createdAt: true,
        workspaceMemberships: {
          orderBy: { createdAt: "asc" },
          select: {
            role: true,
            joinedAt: true,
            createdAt: true,
            workspace: {
              select: {
                id: true,
                name: true,
                createdAt: true,

                accessLevel: true,
                plan: true,
                subscriptionStatus: true,
                trialEndsAt: true,
                currentPeriodEnd: true,
                stripeCustomerId: true,
                stripeSubscriptionId: true,
                stripeBasePriceId: true,
              },
            },
          },
        },
      },
    });

    return NextResponse.json({ ok: true, user: buildUserPayload(refreshed) });
  } catch (err) {
    console.error("Admin PATCH user error:", err);
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}
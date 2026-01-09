import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  UserRole,
  SubscriptionPlan,
  SubscriptionStatus,
  AccessLevel,
  WorkspaceRole,
} from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdmin() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return { errorResponse: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const dbUser = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, role: true },
  });

  if (!dbUser || dbUser.role !== "ADMIN") {
    return { errorResponse: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { ok: true as const, dbUser };
}

function toIso(d: Date | null | undefined) {
  return d ? d.toISOString() : null;
}

function buildUserPayload(u: any) {
  const memberships =
    (u.workspaceMemberships || []).map((wm: any) => ({
      workspaceId: wm.workspace?.id as string,
      workspaceName: (wm.workspace?.name as string) ?? "Untitled workspace",
      workspaceCreatedAt: wm.workspace?.createdAt
        ? new Date(wm.workspace.createdAt).toISOString()
        : null,
      role: wm.role as WorkspaceRole,
      joinedAt: toIso(wm.createdAt ?? null),
    })) ?? [];

  return {
    id: u.id,
    name: u.name ?? "",
    email: u.email,
    brokerage: u.brokerage ?? "",
    role: u.role as UserRole,

    accessLevel: (u.accessLevel ?? "PAID") as AccessLevel,

    plan: u.plan as SubscriptionPlan,
    subscriptionStatus: (u.subscriptionStatus ?? null) as SubscriptionStatus | null,
    trialEndsAt: toIso(u.trialEndsAt ?? null),
    currentPeriodEnd: toIso(u.currentPeriodEnd ?? null),

    stripeCustomerId: u.stripeCustomerId ?? null,
    stripeSubscriptionId: u.stripeSubscriptionId ?? null,
    stripePriceId: u.stripePriceId ?? null,

    openAITokensUsed: u.openAITokensUsed ?? 0,
    lastLoginAt: toIso(u.lastLoginAt ?? null),
    createdAt: u.createdAt.toISOString(),

    // NEW (workspace footprint)
    workspaceCount: memberships.length,
    memberships,
  };
}

// GET all users (with workspace memberships)
export async function GET() {
  const auth = await requireAdmin();
  if ("errorResponse" in auth) return auth.errorResponse;

  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        workspaceMemberships: {
          include: {
            workspace: { select: { id: true, name: true, createdAt: true } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    return NextResponse.json({ users: users.map(buildUserPayload) });
  } catch (err) {
    console.error("Admin GET users error:", err);
    return NextResponse.json({ error: "Failed to load users" }, { status: 500 });
  }
}

// PATCH update role/plan/status/accessLevel OR run actions
export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin();
  if ("errorResponse" in auth) return auth.errorResponse;

  try {
    const body = await req.json().catch(() => ({}));
    const { userId, role, plan, subscriptionStatus, accessLevel, action } = body ?? {};

    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    // One-click action: grant Founding Pro (manual override)
    if (action === "GRANT_FOUNDING_PRO") {
      const updated = await prisma.user.update({
        where: { id: userId },
        data: {
          accessLevel: "PAID",
          plan: "FOUNDING_PRO",
          subscriptionStatus: "ACTIVE",
          trialEndsAt: null,
          currentPeriodEnd: null,
        } as any,
        include: {
          workspaceMemberships: {
            include: { workspace: { select: { id: true, name: true, createdAt: true } } },
          },
        },
      });

      return NextResponse.json({ user: buildUserPayload(updated) });
    }

    // One-click action: grant Beta access (no Stripe)
    if (action === "GRANT_BETA") {
      const updated = await prisma.user.update({
        where: { id: userId },
        data: {
          accessLevel: "BETA",
          subscriptionStatus: "NONE",
        } as any,
        include: {
          workspaceMemberships: {
            include: { workspace: { select: { id: true, name: true, createdAt: true } } },
          },
        },
      });

      return NextResponse.json({ user: buildUserPayload(updated) });
    }

    // One-click action: expire access
    if (action === "EXPIRE_ACCESS") {
      const updated = await prisma.user.update({
        where: { id: userId },
        data: { accessLevel: "EXPIRED" } as any,
        include: {
          workspaceMemberships: {
            include: { workspace: { select: { id: true, name: true, createdAt: true } } },
          },
        },
      });

      return NextResponse.json({ user: buildUserPayload(updated) });
    }

    const data: any = {};

    if (role) {
      if (!Object.values(UserRole).includes(role)) {
        return NextResponse.json({ error: "Invalid role" }, { status: 400 });
      }
      data.role = role;
    }

    if (accessLevel) {
      if (!Object.values(AccessLevel).includes(accessLevel)) {
        return NextResponse.json({ error: "Invalid accessLevel" }, { status: 400 });
      }
      data.accessLevel = accessLevel;
    }

    if (plan) {
      if (!Object.values(SubscriptionPlan).includes(plan)) {
        return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
      }
      data.plan = plan;
    }

    if (subscriptionStatus) {
      if (!Object.values(SubscriptionStatus).includes(subscriptionStatus)) {
        return NextResponse.json({ error: "Invalid subscriptionStatus" }, { status: 400 });
      }
      data.subscriptionStatus = subscriptionStatus;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data,
      include: {
        workspaceMemberships: {
          include: { workspace: { select: { id: true, name: true, createdAt: true } } },
        },
      },
    });

    return NextResponse.json({ user: buildUserPayload(updated) });
  } catch (err) {
    console.error("Admin PATCH user error:", err);
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}

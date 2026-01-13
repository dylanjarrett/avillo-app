// src/lib/workspace.ts
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";

const ACTIVE_WS_COOKIE = "avillo_workspace_id";

export async function requireWorkspace() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  const tokenWorkspaceId = (session?.user as any)?.workspaceId as string | undefined;

  if (!userId) {
    return { ok: false as const, status: 401, error: { error: "Unauthorized" } };
  }

  // ✅ NEW: cookie overrides session/default workspace (server-trust selection)
  const cookieWorkspaceId = cookies().get(ACTIVE_WS_COOKIE)?.value || undefined;

  // Fallback: user default workspace
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { defaultWorkspaceId: true },
  });

  const workspaceId = cookieWorkspaceId || tokenWorkspaceId || user?.defaultWorkspaceId || undefined;

  if (!workspaceId) {
    return { ok: false as const, status: 409, error: { error: "No workspace selected" } };
  }

  const membership = await prisma.workspaceUser.findFirst({
    where: { workspaceId, userId, removedAt: null },
    select: {
      role: true,
      workspace: {
        select: {
          id: true,
          name: true,
          type: true,
          accessLevel: true,
          plan: true,
          subscriptionStatus: true,
          seatLimit: true,
          includedSeats: true,
        },
      },
    },
  });

  if (!membership) {
    // If cookie points to a workspace they can’t access, fall back once to defaultWorkspaceId
    if (cookieWorkspaceId && user?.defaultWorkspaceId && user.defaultWorkspaceId !== cookieWorkspaceId) {
      const fallback = await prisma.workspaceUser.findFirst({
        where: { workspaceId: user.defaultWorkspaceId, userId, removedAt: null },
        select: {
          role: true,
          workspace: {
            select: {
              id: true,
              name: true,
              type: true,
              accessLevel: true,
              plan: true,
              subscriptionStatus: true,
              seatLimit: true,
              includedSeats: true,
            },
          },
        },
      });

      if (fallback) {
        return {
          ok: true as const,
          userId,
          workspaceId: user.defaultWorkspaceId,
          workspaceRole: String(fallback.role),
          workspace: fallback.workspace,
        };
      }
    }

    return { ok: false as const, status: 403, error: { error: "Not authorized for this workspace." } };
  }

  return {
    ok: true as const,
    userId,
    workspaceId,
    workspaceRole: String(membership.role),
    workspace: membership.workspace,
  };
}
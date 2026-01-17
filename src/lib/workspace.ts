// src/lib/workspace.ts
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";

const ACTIVE_WS_COOKIE = "avillo_workspace_id";

type WorkspaceCtx =
  | { ok: false; status: number; error: { error: string } }
  | {
      ok: true;
      userId: string;
      workspaceId: string;
      workspaceRole: string;
      workspace: {
        id: string;
        name: string;
        type: string;
        accessLevel: string;
        plan: string;
        subscriptionStatus: string;
        seatLimit: number;
        includedSeats: number;
      };
    };

export async function requireWorkspace(): Promise<WorkspaceCtx> {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  const tokenWorkspaceId = (session?.user as any)?.workspaceId as string | undefined;

  if (!userId) {
    return { ok: false as const, status: 401, error: { error: "Unauthorized" } };
  }

  const jar = cookies();
  const cookieWorkspaceId = jar.get(ACTIVE_WS_COOKIE)?.value || undefined;

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
    // If cookie points to a workspace they can’t access, clear it and fall back once
    if (cookieWorkspaceId) {
      jar.delete(ACTIVE_WS_COOKIE);
    }

    const fallbackWorkspaceId =
      user?.defaultWorkspaceId && user.defaultWorkspaceId !== workspaceId
        ? user.defaultWorkspaceId
        : undefined;

    if (fallbackWorkspaceId) {
      const fallback = await prisma.workspaceUser.findFirst({
        where: { workspaceId: fallbackWorkspaceId, userId, removedAt: null },
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
          workspaceId: fallbackWorkspaceId,
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
    workspaceRole: membership.role,
    workspace: membership.workspace,
  };
}
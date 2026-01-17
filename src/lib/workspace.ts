// src/lib/workspace.ts
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";

const ACTIVE_WS_COOKIE = "avillo_workspace_id";

export type WorkspaceCtx = {
  ok: boolean;
  status: number;
  error: { error: string } | null;

  userId: string | null;
  workspaceId: string | null;
  workspaceRole: string | null;
  workspace: {
    id: string;
    name: string;
    type: string;
    accessLevel: string;
    plan: string;
    subscriptionStatus: string;
    seatLimit: number;
    includedSeats: number;
  } | null;
};

export async function requireWorkspace(): Promise<WorkspaceCtx> {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  const tokenWorkspaceId = (session?.user as any)?.workspaceId as string | undefined;

  if (!userId) {
    return {
      ok: false,
      status: 401,
      error: { error: "Unauthorized" },
      userId: null,
      workspaceId: null,
      workspaceRole: null,
      workspace: null,
    };
  }

  const cookieWorkspaceId = cookies().get(ACTIVE_WS_COOKIE)?.value || undefined;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { defaultWorkspaceId: true },
  });

  const pickedWorkspaceId =
    cookieWorkspaceId || tokenWorkspaceId || user?.defaultWorkspaceId || undefined;

  if (!pickedWorkspaceId) {
    return {
      ok: false,
      status: 409,
      error: { error: "No workspace selected" },
      userId,
      workspaceId: null,
      workspaceRole: null,
      workspace: null,
    };
  }

  const membership = await prisma.workspaceUser.findFirst({
    where: { workspaceId: pickedWorkspaceId, userId, removedAt: null },
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

  // Fallback once if cookie/token workspace isn't accessible
  if (!membership) {
    const fallbackWorkspaceId =
      user?.defaultWorkspaceId && user.defaultWorkspaceId !== pickedWorkspaceId
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
          ok: true,
          status: 200,
          error: null,
          userId,
          workspaceId: fallbackWorkspaceId,
          workspaceRole: String(fallback.role),
          workspace: {
            ...fallback.workspace,
            seatLimit: fallback.workspace.seatLimit ?? 0,
            includedSeats: fallback.workspace.includedSeats ?? 0,
          },
        };
      }
    }

    return {
      ok: false,
      status: 403,
      error: { error: "Not authorized for this workspace." },
      userId,
      workspaceId: null,
      workspaceRole: null,
      workspace: null,
    };
  }

  return {
    ok: true,
    status: 200,
    error: null,
    userId,
    workspaceId: pickedWorkspaceId,
    workspaceRole: String(membership.role),
    workspace: {
      ...membership.workspace,
      seatLimit: membership.workspace.seatLimit ?? 0,
      includedSeats: membership.workspace.includedSeats ?? 0,
    },
  };
}
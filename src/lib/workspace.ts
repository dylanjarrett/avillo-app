// src/lib/workspace.ts
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function requireWorkspace() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  const tokenWorkspaceId = (session?.user as any)?.workspaceId as string | undefined;

  if (!userId) {
    return { ok: false as const, status: 401, error: { error: "Unauthorized" } };
  }

  // Prefer session.workspaceId; else fallback to User.defaultWorkspaceId
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { defaultWorkspaceId: true },
  });

  const workspaceId = tokenWorkspaceId || user?.defaultWorkspaceId || undefined;

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
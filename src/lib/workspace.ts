import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function requireWorkspace() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  const workspaceId = (session?.user as any)?.workspaceId as string | undefined;

  if (!userId) {
    return { ok: false as const, status: 401, error: { error: "Unauthorized" } };
  }
  if (!workspaceId) {
    return { ok: false as const, status: 400, error: { error: "No workspace selected" } };
  }

  const membership = await prisma.workspaceUser.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: true },
  });

  if (!membership) {
    return { ok: false as const, status: 403, error: { error: "Not authorized for this workspace." } };
  }

  return {
    ok: true as const,
    userId,
    workspaceId,
    workspaceRole: String(membership.role),
  };
}
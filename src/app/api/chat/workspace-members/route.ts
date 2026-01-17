// src/app/api/chat/workspace-members/route.ts
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";
import { fromLib, ok } from "@/lib/chat/response";

export async function GET() {
  const a = await requireWorkspace();
  if (!a.ok) return fromLib(a);

  const rows = await prisma.workspaceUser.findMany({
    where: { workspaceId: a.workspaceId, removedAt: null },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      userId: true,
      role: true,
      createdAt: true,
      removedAt: true,
      user: { select: { id: true, name: true, email: true, image: true } },
    },
  });

  // Normalize to the exact member shape you want everywhere
  const members = rows.map((r) => ({
    id: r.id, // ✅ stable real id
    userId: r.userId,
    role: r.role, // ✅ OWNER/ADMIN/AGENT
    createdAt: r.createdAt,
    removedAt: r.removedAt,
    user: r.user,
  }));

  return ok({
    ok: true,
    workspaceId: a.workspaceId,
    members,
  });
}
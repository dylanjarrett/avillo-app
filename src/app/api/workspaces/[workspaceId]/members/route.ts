// src/app/api/workspaces/[workspaceId]/members/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";

export async function GET(req: Request, { params }: { params: { workspaceId: string } }) {
  const gate = await requireWorkspace();
  if (!gate.ok) return NextResponse.json(gate.error, { status: gate.status });

  const { workspaceId: sessionWorkspaceId, workspaceRole } = gate;
  const workspaceId = params.workspaceId;

  if (workspaceId !== sessionWorkspaceId) {
    return NextResponse.json({ error: "Not authorized for this workspace." }, { status: 403 });
  }

  const url = new URL(req.url);
  const includeRemoved = url.searchParams.get("includeRemoved") === "true";

  // If you want to restrict member listing:
  // if (workspaceRole !== "OWNER" && workspaceRole !== "ADMIN") {
  //   return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  // }

  const members = await prisma.workspaceUser.findMany({
    where: {
      workspaceId,
      ...(includeRemoved ? {} : { removedAt: null }),
    },
    orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
    select: {
      userId: true,
      role: true,
      joinedAt: true,
      removedAt: true,
      createdAt: true,
      user: {
        select: { id: true, name: true, email: true, image: true },
      },
    },
  });

  return NextResponse.json({
    ok: true,
    workspaceRole,
    members,
  });
}

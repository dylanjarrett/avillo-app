// src/app/api/workspaces/[workspaceId]/transfer-ownership/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";

export async function POST(req: Request, { params }: { params: { workspaceId: string } }) {
  const gate = await requireWorkspace();
  if (!gate.ok) return NextResponse.json(gate.error, { status: gate.status });

  const { workspaceId: sessionWorkspaceId, workspaceRole, userId } = gate;
  const workspaceId = params.workspaceId;

  if (workspaceId !== sessionWorkspaceId) {
    return NextResponse.json({ error: "Not authorized for this workspace." }, { status: 403 });
  }

  if (workspaceRole !== "OWNER") {
    return NextResponse.json({ error: "Only OWNER can transfer ownership." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const toUserId = String(body?.toUserId || "");

  if (!toUserId) return NextResponse.json({ error: "toUserId is required." }, { status: 400 });
  if (toUserId === userId) return NextResponse.json({ error: "You are already the OWNER." }, { status: 400 });

  const targetMember = await prisma.workspaceUser.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: toUserId } },
    select: { removedAt: true },
  });

  if (!targetMember || targetMember.removedAt) {
    return NextResponse.json({ error: "Target user is not an active member." }, { status: 400 });
  }

  const members = await prisma.$transaction(async (tx) => {
    await tx.workspaceUser.update({
      where: { workspaceId_userId: { workspaceId, userId } },
      data: { role: "ADMIN" },
    });

    await tx.workspaceUser.update({
      where: { workspaceId_userId: { workspaceId, userId: toUserId } },
      data: { role: "OWNER" },
    });

    const owners = await tx.workspaceUser.count({
      where: { workspaceId, role: "OWNER", removedAt: null },
    });

    if (owners < 1) throw new Error("Ownership invariant failed");

    return tx.workspaceUser.findMany({
      where: { workspaceId, removedAt: null },
      select: {
        userId: true,
        role: true,
        joinedAt: true,
        user: { select: { id: true, name: true, email: true, image: true } },
      },
      orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
    });
  });

  return NextResponse.json({ ok: true, members });
}
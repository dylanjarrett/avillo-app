// src/app/api/workspaces/[workspaceId]/members/[userId]/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";

type WorkspaceRole = "OWNER" | "ADMIN" | "AGENT";

function isOwner(role: string): role is WorkspaceRole {
  return role === "OWNER";
}
function isAdminOrOwner(role: string): role is WorkspaceRole {
  return role === "OWNER" || role === "ADMIN";
}

async function countActiveOwners(workspaceId: string) {
  return prisma.workspaceUser.count({
    where: { workspaceId, role: "OWNER", removedAt: null },
  });
}

export async function PATCH(req: Request, { params }: { params: { workspaceId: string; userId: string } }) {
  const gate = await requireWorkspace();
  if (!gate.ok) return NextResponse.json(gate.error, { status: gate.status });

  const { workspaceId: sessionWorkspaceId, workspaceRole } = gate;
  const workspaceId = params.workspaceId;
  const targetUserId = params.userId;

  if (workspaceId !== sessionWorkspaceId) {
    return NextResponse.json({ error: "Not authorized for this workspace." }, { status: 403 });
  }
  if (!isAdminOrOwner(workspaceRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const nextRole = String(body?.role || "").toUpperCase() as WorkspaceRole;

  if (!["OWNER", "ADMIN", "AGENT"].includes(nextRole)) {
    return NextResponse.json({ error: "Invalid role." }, { status: 400 });
  }

  // force transfer endpoint for OWNER changes
  if (nextRole === "OWNER") {
    return NextResponse.json({ error: "Use /transfer-ownership to assign OWNER." }, { status: 400 });
  }

  const existing = await prisma.workspaceUser.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
    select: { role: true, removedAt: true },
  });

  if (!existing || existing.removedAt) {
    return NextResponse.json({ error: "Member not found." }, { status: 404 });
  }

  // Only OWNER can modify an OWNER
  if (existing.role === "OWNER" && !isOwner(workspaceRole)) {
    return NextResponse.json({ error: "Only OWNER can modify an OWNER." }, { status: 403 });
  }

  // ADMIN can only modify AGENT<->ADMIN (cannot touch owners)
  if (workspaceRole === "ADMIN") {
    if (!["AGENT", "ADMIN"].includes(existing.role as any)) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
    if (!["AGENT", "ADMIN"].includes(nextRole)) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
  }

  // Guard: don't demote last OWNER (defensive, even though we block OWNER edits here)
  if (existing.role === "OWNER") {
    const owners = await countActiveOwners(workspaceId);
    if (owners <= 1) {
      return NextResponse.json({ error: "Cannot demote the last OWNER." }, { status: 400 });
    }
  }

  const updated = await prisma.workspaceUser.update({
    where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
    data: { role: nextRole as any },
    select: {
      userId: true,
      role: true,
      joinedAt: true,
      removedAt: true,
      user: { select: { id: true, name: true, email: true, image: true } },
    },
  });

  return NextResponse.json({ ok: true, member: updated });
}

export async function DELETE(req: Request, { params }: { params: { workspaceId: string; userId: string } }) {
  const gate = await requireWorkspace();
  if (!gate.ok) return NextResponse.json(gate.error, { status: gate.status });

  const { workspaceId: sessionWorkspaceId, workspaceRole, userId: actorUserId } = gate;
  const workspaceId = params.workspaceId;
  const targetUserId = params.userId;

  if (workspaceId !== sessionWorkspaceId) {
    return NextResponse.json({ error: "Not authorized for this workspace." }, { status: 403 });
  }
  if (!isAdminOrOwner(workspaceRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const existing = await prisma.workspaceUser.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
    select: { role: true, removedAt: true },
  });

  if (!existing || existing.removedAt) {
    return NextResponse.json({ error: "Member not found." }, { status: 404 });
  }

  // Prevent self-removal if you're the last OWNER (common footgun)
  if (targetUserId === actorUserId && existing.role === "OWNER") {
    const owners = await countActiveOwners(workspaceId);
    if (owners <= 1) {
      return NextResponse.json({ error: "You cannot remove yourself as the last OWNER." }, { status: 400 });
    }
  }

  // Only OWNER can remove an OWNER
  if (existing.role === "OWNER" && !isOwner(workspaceRole)) {
    return NextResponse.json({ error: "Only OWNER can remove an OWNER." }, { status: 403 });
  }

  // Prevent removing last OWNER
  if (existing.role === "OWNER") {
    const owners = await countActiveOwners(workspaceId);
    if (owners <= 1) {
      return NextResponse.json({ error: "Cannot remove the last OWNER." }, { status: 400 });
    }
  }

  const updated = await prisma.workspaceUser.update({
    where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
    data: { removedAt: new Date() },
    select: { userId: true, role: true, removedAt: true },
  });

  return NextResponse.json({ ok: true, member: updated });
}
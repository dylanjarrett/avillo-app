// src/app/api/workspaces/me/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";

type WorkspaceRole = "OWNER" | "ADMIN" | "AGENT";

function normalizeRole(role: unknown): WorkspaceRole {
  const r = String(role || "").toUpperCase();
  if (r === "OWNER" || r === "ADMIN" || r === "AGENT") return r as WorkspaceRole;
  return "AGENT";
}

export async function GET() {
  const gate = await requireWorkspace();
  if (!gate.ok) return NextResponse.json(gate.error, { status: gate.status });

  const { userId, workspaceId, workspaceRole } = gate;

  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
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
  });

  if (!ws) return NextResponse.json({ error: "Workspace not found." }, { status: 404 });

  return NextResponse.json({
    ok: true,
    userId,
    workspace: {
      id: ws.id,
      name: ws.name,
      role: normalizeRole(workspaceRole),
      type: ws.type,
      accessLevel: ws.accessLevel,
      plan: ws.plan,
      subscriptionStatus: ws.subscriptionStatus,
      seatLimit: ws.seatLimit,
      includedSeats: ws.includedSeats,
    },
  });
}
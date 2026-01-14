import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function normalizeName(input: unknown) {
  return String(input ?? "").replace(/\s+/g, " ").trim();
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const workspaceId = String(body?.workspaceId ?? "").trim();
  const name = normalizeName(body?.name);

  if (!workspaceId) {
    return NextResponse.json({ ok: false, error: "Missing workspaceId" }, { status: 400 });
  }

  if (!name) {
    return NextResponse.json({ ok: false, error: "Workspace name is required." }, { status: 400 });
  }

  if (name.length < 2) {
    return NextResponse.json(
      { ok: false, error: "Workspace name must be at least 2 characters." },
      { status: 400 }
    );
  }

  if (name.length > 60) {
    return NextResponse.json(
      { ok: false, error: "Workspace name must be 60 characters or fewer." },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });

  if (!user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const membership = await prisma.workspaceUser.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId: user.id,
      },
    },
    select: { role: true, removedAt: true },
  });

  if (!membership || membership.removedAt) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  if (membership.role !== "OWNER") {
    return NextResponse.json(
      { ok: false, error: "Only Owners can rename the workspace." },
      { status: 403 }
    );
  }

  const updated = await prisma.workspace.update({
    where: { id: workspaceId },
    data: { name },
    select: { id: true, name: true, updatedAt: true },
  });

  return NextResponse.json({ ok: true, workspace: updated }, { status: 200 });
}
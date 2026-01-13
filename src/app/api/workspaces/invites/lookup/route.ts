// src/app/api/workspaces/invites/lookup/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function normalizeEmail(v: unknown) {
  return String(v || "").trim().toLowerCase();
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = String(url.searchParams.get("token") || "").trim();
  if (!token) {
    return NextResponse.json({ ok: false, error: "Token is required." }, { status: 400 });
  }

  const invite = await prisma.workspaceInvite.findUnique({
    where: { token },
    select: {
      email: true,
      role: true,
      status: true,
      expiresAt: true,
      revokedAt: true,
      workspace: { select: { name: true } },
      invitedByUser: { select: { name: true, email: true } },
    },
  });

  if (!invite) {
    return NextResponse.json({ ok: false, error: "Invite not found." }, { status: 404 });
  }

  // expire if needed
  if (invite.status === "PENDING" && invite.expiresAt < new Date()) {
    await prisma.workspaceInvite.update({
      where: { token },
      data: { status: "EXPIRED" },
    });
    return NextResponse.json({ ok: false, error: "Invite expired." }, { status: 400 });
  }

  if (invite.status !== "PENDING" || invite.revokedAt) {
    return NextResponse.json({ ok: false, error: "Invite is not active." }, { status: 400 });
  }

  const email = normalizeEmail(invite.email);

  const existing = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true },
  });

  const inviterName =
    invite.invitedByUser?.name?.trim() ||
    (invite.invitedByUser?.email ? invite.invitedByUser.email.split("@")[0] : null);

  return NextResponse.json({
    ok: true,
    alreadyExists: Boolean(existing?.id),
    invite: {
      email,
      role: invite.role,
      status: invite.status,
      expiresAt: invite.expiresAt?.toISOString?.() ?? null,
      workspaceName: invite.workspace?.name ?? null,
      inviterName: inviterName ?? null,
    },
  });
}
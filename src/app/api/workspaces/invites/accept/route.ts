// src/app/api/workspaces/invites/accept/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

function normalizeEmail(v: unknown) {
  return String(v || "").trim().toLowerCase();
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;

  if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const token = String(body?.token || "");
  if (!token) return NextResponse.json({ ok: false, error: "Token is required." }, { status: 400 });

  const invite = await prisma.workspaceInvite.findUnique({
    where: { token },
    select: {
      id: true,
      workspaceId: true,
      email: true,
      role: true,
      status: true,
      expiresAt: true,
      revokedAt: true,
    },
  });

  if (!invite) return NextResponse.json({ ok: false, error: "Invite not found." }, { status: 404 });

  // Expire if needed
  if (invite.status === "PENDING" && invite.expiresAt < new Date()) {
    await prisma.workspaceInvite.update({
      where: { id: invite.id },
      data: { status: "EXPIRED" },
    });
    return NextResponse.json({ ok: false, error: "Invite expired." }, { status: 400 });
  }

  if (invite.status === "ACCEPTED") {
    return NextResponse.json({ ok: false, error: "Invite already accepted." }, { status: 400 });
  }

  if (invite.status === "REVOKED" || invite.revokedAt) {
    return NextResponse.json({ ok: false, error: "Invite revoked." }, { status: 400 });
  }

  if (invite.status === "EXPIRED") {
    return NextResponse.json({ ok: false, error: "Invite expired." }, { status: 400 });
  }

  // Email must match logged-in user (recommended)
  const sessionEmail = normalizeEmail((session?.user as any)?.email);
  if (sessionEmail && sessionEmail !== normalizeEmail(invite.email)) {
    return NextResponse.json(
      { ok: false, error: "Invite email does not match logged-in user." },
      { status: 403 }
    );
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Lock in seatLimit and current active membership
      const ws = await tx.workspace.findUnique({
        where: { id: invite.workspaceId },
        select: { seatLimit: true },
      });
      if (!ws) throw new Error("WORKSPACE_NOT_FOUND");

      const existing = await tx.workspaceUser.findUnique({
        where: { workspaceId_userId: { workspaceId: invite.workspaceId, userId } },
        select: { removedAt: true },
      });

      const activeMembers = await tx.workspaceUser.count({
        where: { workspaceId: invite.workspaceId, removedAt: null },
      });

      // If user is not already active, joining consumes a seat
      const willConsumeSeat = !existing || !!existing.removedAt;
      if (willConsumeSeat && activeMembers >= ws.seatLimit) {
        throw new Error("NO_AVAILABLE_SEATS");
      }

      // Create or reinstate membership
      if (!existing) {
        await tx.workspaceUser.create({
          data: {
            workspaceId: invite.workspaceId,
            userId,
            role: invite.role as any,
            joinedAt: new Date(),
          },
        });
      } else if (existing.removedAt) {
        await tx.workspaceUser.update({
          where: { workspaceId_userId: { workspaceId: invite.workspaceId, userId } },
          data: { removedAt: null, joinedAt: new Date(), role: invite.role as any },
        });
      } else {
        // Already active member; optional: update role to invite role (usually not needed)
        // await tx.workspaceUser.update({ ... })
      }

      const updatedInvite = await tx.workspaceInvite.update({
        where: { id: invite.id },
        data: {
          status: "ACCEPTED",
          acceptedAt: new Date(),
          acceptedByUserId: userId,
        },
        select: {
          id: true,
          workspaceId: true,
          email: true,
          role: true,
          status: true,
          acceptedAt: true,
        },
      });

      // Switch default workspace to the one they joined
      await tx.user.update({
        where: { id: userId },
        data: { defaultWorkspaceId: updatedInvite.workspaceId },
      });

      return updatedInvite;
    });

    return NextResponse.json({ ok: true, invite: result, workspaceId: result.workspaceId });
  } catch (err: any) {
    const msg = String(err?.message || "");

    if (msg === "NO_AVAILABLE_SEATS") {
      return NextResponse.json(
        { ok: false, error: "No available seats in this workspace. Ask the owner to add seats." },
        { status: 409 }
      );
    }

    if (msg === "WORKSPACE_NOT_FOUND") {
      return NextResponse.json({ ok: false, error: "Workspace not found." }, { status: 404 });
    }

    console.error("INVITE ACCEPT ERROR →", err);
    return NextResponse.json({ ok: false, error: "Failed to accept invite." }, { status: 500 });
  }
}
// src/app/api/workspaces/invites/accept/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireEntitlement } from "@/lib/entitlements";

const ACTIVE_WS_COOKIE = "avillo_workspace_id";

function normalizeEmail(v: unknown) {
  return String(v || "").trim().toLowerCase();
}

function setActiveWorkspaceCookie(res: NextResponse, workspaceId: string) {
  res.cookies.set(ACTIVE_WS_COOKIE, workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;

  if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const token = String(body?.token || "").trim();
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
      acceptedByUserId: true,
    },
  });

  if (!invite) return NextResponse.json({ ok: false, error: "Invite not found." }, { status: 404 });

  // Expire if needed
  if (invite.status === "PENDING" && invite.expiresAt < new Date()) {
    await prisma.workspaceInvite.update({ where: { id: invite.id }, data: { status: "EXPIRED" } });
    return NextResponse.json({ ok: false, error: "Invite expired." }, { status: 400 });
  }

  // ✅ Idempotent
  if (invite.status === "ACCEPTED") {
    if (invite.acceptedByUserId === userId) {
      const res = NextResponse.json({ ok: true, alreadyAccepted: true, workspaceId: invite.workspaceId });
      setActiveWorkspaceCookie(res, invite.workspaceId);
      return res;
    }
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
    return NextResponse.json({ ok: false, error: "Invite email does not match logged-in user." }, { status: 403 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const ws = await tx.workspace.findUnique({
        where: { id: invite.workspaceId },
        select: { id: true, seatLimit: true },
      });
      if (!ws) throw new Error("WORKSPACE_NOT_FOUND");

      const seatLimit = Math.max(1, Number(ws.seatLimit ?? 1));

      // Are they already a member?
      const existing = await tx.workspaceUser.findUnique({
        where: { workspaceId_userId: { workspaceId: invite.workspaceId, userId } },
        select: { removedAt: true },
      });

      const isAlreadyActiveMember = !!existing && existing.removedAt == null;
      const willConsumeSeat = !isAlreadyActiveMember;

      // 🔒 BULLETPROOF: if accepting would add a seat, require entitlement (billing not on hold)
      if (willConsumeSeat) {
        const ent = await requireEntitlement(invite.workspaceId, "WORKSPACE_INVITE");
        if (!ent.ok) {
          throw new Error("BILLING_REQUIRED");
        }

        const activeMembers = await tx.workspaceUser.count({
          where: { workspaceId: invite.workspaceId, removedAt: null },
        });

        if (activeMembers >= seatLimit) {
          throw new Error("NO_AVAILABLE_SEATS");
        }
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
      }

      const updatedInvite = await tx.workspaceInvite.update({
        where: { id: invite.id },
        data: {
          status: "ACCEPTED",
          acceptedAt: new Date(),
          acceptedByUserId: userId,
        },
        select: { id: true, workspaceId: true, email: true, role: true, status: true, acceptedAt: true },
      });

      await tx.user.update({
        where: { id: userId },
        data: { defaultWorkspaceId: updatedInvite.workspaceId },
      });

      return updatedInvite;
    });

    const res = NextResponse.json({ ok: true, invite: result, workspaceId: result.workspaceId });
    setActiveWorkspaceCookie(res, result.workspaceId);
    return res;
  } catch (err: any) {
    const msg = String(err?.message || "");

    if (msg === "BILLING_REQUIRED") {
      return NextResponse.json(
        {
          ok: false,
          code: "BILLING_REQUIRED",
          error: "This workspace can’t add seats right now. Ask the owner to update billing to accept this invite.",
        },
        { status: 402 }
      );
    }

    if (msg === "NO_AVAILABLE_SEATS") {
      return NextResponse.json(
        { ok: false, code: "NO_SEATS", error: "No available seats in this workspace. Ask the owner to add seats." },
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
// src/app/api/auth/signup-invite/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);

  const token = String(body?.token || "").trim();
  const name = String(body?.name || "").trim();
  const email = normalizeEmail(body?.email);
  const password = String(body?.password || "");

  if (!token) return NextResponse.json({ ok: false, error: "Token is required." }, { status: 400 });
  if (!name) return NextResponse.json({ ok: false, error: "Name is required." }, { status: 400 });
  if (!email) return NextResponse.json({ ok: false, error: "Email is required." }, { status: 400 });
  if (!password || password.length < 8) {
    return NextResponse.json({ ok: false, error: "Password must be at least 8 characters." }, { status: 400 });
  }

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

  if (invite.status !== "PENDING" || invite.revokedAt) {
    return NextResponse.json({ ok: false, error: "Invite is not active." }, { status: 400 });
  }

  if (normalizeEmail(invite.email) !== email) {
    return NextResponse.json({ ok: false, error: "Invite email does not match." }, { status: 403 });
  }

  // ✅ deterministic: if user exists -> 409 ACCOUNT_EXISTS
  const existing = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true },
  });

  if (existing?.id) {
    return NextResponse.json(
      { ok: false, code: "ACCOUNT_EXISTS", error: "Account already exists. Sign in to accept this invitation." },
      { status: 409 }
    );
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Seat enforcement
      const ws = await tx.workspace.findUnique({
        where: { id: invite.workspaceId },
        select: { id: true, seatLimit: true },
      });
      if (!ws) throw new Error("WORKSPACE_NOT_FOUND");

      const activeMembers = await tx.workspaceUser.count({
        where: { workspaceId: invite.workspaceId, removedAt: null },
      });

      if (activeMembers >= ws.seatLimit) {
        throw new Error("NO_AVAILABLE_SEATS");
      }

      const passwordHash = await bcrypt.hash(password, 10);

      const user = await tx.user.create({
        data: {
          name,
          email,
          passwordHash,
          emailVerified: new Date(),
          defaultWorkspaceId: invite.workspaceId,
        },
        select: { id: true },
      });

      await tx.workspaceUser.create({
        data: {
          workspaceId: invite.workspaceId,
          userId: user.id,
          role: invite.role as any,
          joinedAt: new Date(),
        },
        select: { id: true },
      });

      await tx.workspaceInvite.update({
        where: { id: invite.id },
        data: {
          status: "ACCEPTED",
          acceptedAt: new Date(),
          acceptedByUserId: user.id,
        },
      });

      return { userId: user.id, workspaceId: invite.workspaceId };
    });

    // ✅ set cookie so requireWorkspace resolves to this workspace immediately
    const res = NextResponse.json({ ok: true, userId: result.userId, workspaceId: result.workspaceId });
    setActiveWorkspaceCookie(res, result.workspaceId);
    return res;
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

    // ✅ deterministic: unique email collision => treat as ACCOUNT_EXISTS
    if (err?.code === "P2002") {
      return NextResponse.json(
        { ok: false, code: "ACCOUNT_EXISTS", error: "Account already exists. Sign in to accept this invitation." },
        { status: 409 }
      );
    }

    console.error("SIGNUP INVITE ERROR →", err);
    return NextResponse.json({ ok: false, error: "Failed to create invited account." }, { status: 500 });
  }
}
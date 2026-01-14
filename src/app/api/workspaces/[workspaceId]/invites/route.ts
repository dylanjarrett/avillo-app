// src/app/api/workspaces/[workspaceId]/invites/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";
import { requireEntitlement } from "@/lib/entitlements";
import crypto from "crypto";
import { sendWorkspaceInviteEmail } from "@/lib/emails/sendWorkspaceInviteEmail";

type WorkspaceRole = "OWNER" | "ADMIN" | "AGENT";

function emailKey(email: string) {
  return String(email || "").trim().toLowerCase();
}

function isAdminOrOwner(role: string): role is WorkspaceRole {
  return role === "OWNER" || role === "ADMIN";
}

function newToken() {
  return crypto.randomBytes(24).toString("base64url");
}

function defaultExpiry(days = 7) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

function getRequestOrigin(req: Request) {
  const proto = req.headers.get("x-forwarded-proto") || "http";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "localhost:3000";
  return `${proto}://${host}`.replace(/\/+$/, "");
}

async function expirePendingInvites(workspaceId: string) {
  await prisma.workspaceInvite.updateMany({
    where: {
      workspaceId,
      status: "PENDING",
      expiresAt: { lt: new Date() },
    },
    data: { status: "EXPIRED" },
  });
}

async function getSeatUsage(workspaceId: string) {
  const now = new Date();

  const [ws, usedSeats, pendingInvites] = await Promise.all([
    prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { seatLimit: true, includedSeats: true, plan: true, subscriptionStatus: true },
    }),
    prisma.workspaceUser.count({
      where: { workspaceId, removedAt: null },
    }),
    prisma.workspaceInvite.count({
      where: {
        workspaceId,
        status: "PENDING",
        revokedAt: null,
        expiresAt: { gt: now },
      },
    }),
  ]);

  const seatLimit = Math.max(1, Number(ws?.seatLimit ?? 1));
  const includedSeats = Math.max(1, Number(ws?.includedSeats ?? 1));
  const reserved = usedSeats + pendingInvites;

  return {
    seatLimit,
    includedSeats,
    usedSeats,
    pendingInvites,
    reserved,
    remaining: Math.max(0, seatLimit - reserved),
    overBy: Math.max(0, reserved - seatLimit),
    billing: {
      plan: ws?.plan ?? null,
      subscriptionStatus: ws?.subscriptionStatus ?? null,
    },
  };
}

/**
 * Returns ok=false when:
 * - not entitled to invite (billing hold / not enterprise / etc)
 * - OR no seats remaining (only if the action would reserve a new seat)
 */
async function enforceInviteGuards(params: {
  workspaceId: string;
  willReserveSeat: boolean;
}) {
  const { workspaceId, willReserveSeat } = params;

  // 1) Must be entitled to invite (this is your “billing hold” gate)
  const ent = await requireEntitlement(workspaceId, "WORKSPACE_INVITE");
  if (!ent.ok) {
    return {
      ok: false as const,
      status: 402,
      body: {
        ok: false,
        code: "BILLING_REQUIRED",
        error:
          "Invites are temporarily paused until billing is updated. Please update your payment method to continue.",
        details: ent.error ?? null,
      },
    };
  }

  // 2) Seat availability only matters if this action reserves a NEW pending seat
  if (willReserveSeat) {
    const seat = await getSeatUsage(workspaceId);
    if (seat.remaining <= 0) {
      return {
        ok: false as const,
        status: 409,
        body: {
          ok: false,
          code: "NO_SEATS",
          error: "No available seats. Increase your seat limit to send more invites.",
          seat,
        },
      };
    }
  }

  return { ok: true as const };
}

export async function GET(req: Request, { params }: { params: { workspaceId: string } }) {
  const gate = await requireWorkspace();
  if (!gate.ok) return NextResponse.json(gate.error, { status: gate.status });

  const { workspaceId: sessionWorkspaceId, workspaceRole } = gate;
  const workspaceId = params.workspaceId;

  if (workspaceId !== sessionWorkspaceId) {
    return NextResponse.json({ ok: false, error: "Not authorized for this workspace." }, { status: 403 });
  }
  if (!isAdminOrOwner(workspaceRole)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status") || undefined;

  await expirePendingInvites(workspaceId);

  const [invites, seat] = await Promise.all([
    prisma.workspaceInvite.findMany({
      where: {
        workspaceId,
        ...(status ? { status: status as any } : {}),
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        emailKey: true,
        role: true,
        status: true,
        expiresAt: true,
        acceptedAt: true,
        revokedAt: true,
        createdAt: true,
        invitedByUserId: true,
        acceptedByUserId: true,
      },
    }),
    getSeatUsage(workspaceId),
  ]);

  return NextResponse.json({ ok: true, invites, seat });
}

export async function POST(req: Request, { params }: { params: { workspaceId: string } }) {
  const gate = await requireWorkspace();
  if (!gate.ok) return NextResponse.json(gate.error, { status: gate.status });

  const { workspaceId: sessionWorkspaceId, workspaceRole, userId } = gate;
  const workspaceId = params.workspaceId;

  if (workspaceId !== sessionWorkspaceId) {
    return NextResponse.json({ ok: false, error: "Not authorized for this workspace." }, { status: 403 });
  }
  if (!isAdminOrOwner(workspaceRole)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const email = String(body?.email || "").trim();
  const role = String(body?.role || "AGENT").toUpperCase() as WorkspaceRole;

  if (!email) return NextResponse.json({ ok: false, error: "Email is required." }, { status: 400 });
  if (!["OWNER", "ADMIN", "AGENT"].includes(role)) {
    return NextResponse.json({ ok: false, error: "Invalid role." }, { status: 400 });
  }

  // Only OWNER can invite OWNER
  if (role === "OWNER" && workspaceRole !== "OWNER") {
    return NextResponse.json({ ok: false, error: "Only an OWNER can invite another OWNER." }, { status: 403 });
  }

  await expirePendingInvites(workspaceId);

  const key = emailKey(email);
  const now = new Date();

  // If user exists and is already active member → block (case-insensitive)
  const existingUser = await prisma.user.findFirst({
    where: { email: { equals: key, mode: "insensitive" } },
    select: { id: true },
  });

  if (existingUser?.id) {
    const member = await prisma.workspaceUser.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: existingUser.id } },
      select: { removedAt: true },
    });

    if (member && member.removedAt == null) {
      return NextResponse.json({ ok: false, error: "User is already a member of this workspace." }, { status: 409 });
    }
  }

  // Determine whether this operation would reserve a NEW pending invite seat
  const existingInvite = await prisma.workspaceInvite.findUnique({
    where: { workspaceId_emailKey: { workspaceId, emailKey: key } },
    select: { status: true, expiresAt: true, revokedAt: true },
  });

  const alreadyCountsAsPending =
    !!existingInvite && existingInvite.status === "PENDING" && !existingInvite.revokedAt && existingInvite.expiresAt > now;

  // 🔒 BULLETPROOF: Billing hold + seat availability
  const guards = await enforceInviteGuards({
    workspaceId,
    willReserveSeat: !alreadyCountsAsPending,
  });
  if (!guards.ok) return NextResponse.json(guards.body, { status: guards.status });

  // Upsert invite per (workspaceId, emailKey)
  const invite = await prisma.workspaceInvite.upsert({
    where: { workspaceId_emailKey: { workspaceId, emailKey: key } },
    create: {
      workspaceId,
      email,
      emailKey: key,
      role,
      token: newToken(),
      status: "PENDING",
      expiresAt: defaultExpiry(7),
      invitedByUserId: userId,
      revokedAt: null,
      acceptedAt: null,
      acceptedByUserId: null,
    },
    update: {
      email,
      role,
      token: newToken(),
      status: "PENDING",
      expiresAt: defaultExpiry(7),
      revokedAt: null,
      invitedByUserId: userId,
      acceptedAt: null,
      acceptedByUserId: null,
    },
    select: {
      id: true,
      workspaceId: true,
      email: true,
      emailKey: true,
      role: true,
      status: true,
      token: true,
      expiresAt: true,
      invitedByUserId: true,
      createdAt: true,
    },
  });

  const origin = getRequestOrigin(req);
  try {
    await sendWorkspaceInviteEmail({
      workspaceId: invite.workspaceId,
      invitedByUserId: invite.invitedByUserId ?? null,
      toEmail: invite.email,
      role: invite.role as any,
      token: invite.token,
      expiresAt: invite.expiresAt,
      origin,
    });
  } catch (e) {
    console.error("INVITE EMAIL SEND ERROR →", e);
  }

  return NextResponse.json({ ok: true, invite });
}

export async function PATCH(req: Request, { params }: { params: { workspaceId: string } }) {
  const gate = await requireWorkspace();
  if (!gate.ok) return NextResponse.json(gate.error, { status: gate.status });

  const { workspaceId: sessionWorkspaceId, workspaceRole, userId } = gate;
  const workspaceId = params.workspaceId;

  if (workspaceId !== sessionWorkspaceId) {
    return NextResponse.json({ ok: false, error: "Not authorized for this workspace." }, { status: 403 });
  }
  if (!isAdminOrOwner(workspaceRole)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const inviteId = String(body?.inviteId || "");
  const action = String(body?.action || "revoke"); // "revoke" | "resend"

  if (!inviteId) return NextResponse.json({ ok: false, error: "inviteId is required." }, { status: 400 });

  const existing = await prisma.workspaceInvite.findUnique({
    where: { id: inviteId },
    select: { id: true, workspaceId: true, status: true, expiresAt: true, revokedAt: true, email: true, emailKey: true, role: true, token: true },
  });

  if (!existing || existing.workspaceId !== workspaceId) {
    return NextResponse.json({ ok: false, error: "Invite not found." }, { status: 404 });
  }

  if (action === "revoke") {
    const updated = await prisma.workspaceInvite.update({
      where: { id: inviteId },
      data: { status: "REVOKED", revokedAt: new Date() },
      select: { id: true, email: true, role: true, status: true, expiresAt: true, revokedAt: true },
    });

    return NextResponse.json({ ok: true, invite: updated });
  }

  if (action === "resend") {
    await expirePendingInvites(workspaceId);

    const now = new Date();
    const alreadyCountsAsPending =
      existing.status === "PENDING" && !existing.revokedAt && existing.expiresAt > now;

    // 🔒 BULLETPROOF: Billing hold + seat availability (only if resend would reserve NEW pending seat)
    const guards = await enforceInviteGuards({
      workspaceId,
      willReserveSeat: !alreadyCountsAsPending,
    });
    if (!guards.ok) return NextResponse.json(guards.body, { status: guards.status });

    const updated = await prisma.workspaceInvite.update({
      where: { id: inviteId },
      data: {
        token: newToken(),
        status: "PENDING",
        expiresAt: defaultExpiry(7),
        revokedAt: null,
        invitedByUserId: userId,
      },
      select: {
        id: true,
        workspaceId: true,
        email: true,
        role: true,
        status: true,
        token: true,
        invitedByUserId: true,
        expiresAt: true,
        revokedAt: true,
      },
    });

    const origin = getRequestOrigin(req);
    try {
      await sendWorkspaceInviteEmail({
        workspaceId: updated.workspaceId,
        invitedByUserId: updated.invitedByUserId ?? null,
        toEmail: updated.email,
        role: updated.role as any,
        token: updated.token,
        expiresAt: updated.expiresAt,
        origin,
      });
    } catch (e) {
      console.error("INVITE RESEND EMAIL ERROR →", e);
    }

    return NextResponse.json({ ok: true, invite: updated });
  }

  return NextResponse.json({ ok: false, error: "Invalid action." }, { status: 400 });
}
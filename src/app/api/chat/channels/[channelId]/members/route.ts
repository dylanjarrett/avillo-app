// src/app/api/chat/channels/[channelId]/members/route.ts
import { prisma } from "@/lib/prisma";
import { isElevated, requireChannelAccess } from "@/lib/chat/access";
import { err, fromLib, ok } from "@/lib/chat/response";

type MemberShape = {
  id: string;
  userId: string;
  role: string | null; // OWNER/ADMIN/AGENT (from WorkspaceUser)
  createdAt: Date;
  removedAt: Date | null;
  user: { id: string; name: string | null; email: string | null; image: string | null };
};

function isBoardChannel(channel: any) {
  return String(channel?.type || "").toUpperCase() === "BOARD";
}

function isDMChannel(channel: any) {
  return String(channel?.type || "").toUpperCase() === "DM";
}

function channelCtxOr500(aRaw: any) {
  if (!aRaw?.ok) return null;
  if (!aRaw.channel) return null;
  return aRaw as { ok: true; workspaceId: string; userId: string; workspaceRole: string; channel: any };
}

async function loadWorkspaceRoleMap(workspaceId: string, userIds?: string[]) {
  const where: any = { workspaceId, removedAt: null };
  if (userIds?.length) where.userId = { in: userIds };

  const rows = await prisma.workspaceUser.findMany({
    where,
    select: { userId: true, role: true, id: true },
  });

  const roleByUserId = new Map<string, string>();
  const wuIdByUserId = new Map<string, string>();
  for (const r of rows) {
    roleByUserId.set(r.userId, r.role);
    wuIdByUserId.set(r.userId, r.id);
  }
  return { roleByUserId, wuIdByUserId };
}

export async function GET(_: Request, ctx: { params: { channelId: string } }) {
  const aRaw = await requireChannelAccess(ctx.params.channelId);
  if (!aRaw.ok) return fromLib(aRaw);

  const a = channelCtxOr500(aRaw);
  if (!a) return err("Channel context missing", 500);

  // BOARD: workspace-wide roster (author names always resolve, roles available)
  if (isBoardChannel(a.channel)) {
    const rows = await prisma.workspaceUser.findMany({
      where: { workspaceId: a.workspaceId, removedAt: null },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        userId: true,
        role: true,
        createdAt: true,
        removedAt: true,
        user: { select: { id: true, name: true, email: true, image: true } },
      },
    });

    const members: MemberShape[] = rows.map((r) => ({
      id: r.id, // ✅ real WorkspaceUser id
      userId: r.userId,
      role: r.role,
      createdAt: r.createdAt,
      removedAt: r.removedAt,
      user: r.user,
    }));

    return ok({
      ok: true,
      workspaceId: a.workspaceId,
      channelId: a.channel.id, // ✅ UI-friendly
      channel: a.channel,
      members,
    });
  }

  // ROOM/DM: channel membership list, with roles overlaid from workspace roster
  const cm = await prisma.chatChannelMember.findMany({
    where: { workspaceId: a.workspaceId, channelId: a.channel.id, removedAt: null },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      userId: true,
      createdAt: true,
      removedAt: true,
      user: { select: { id: true, name: true, email: true, image: true } },
    },
  });

  const userIds = cm.map((r) => r.userId);
  const { roleByUserId } = await loadWorkspaceRoleMap(a.workspaceId, userIds);

  const members: MemberShape[] = cm.map((r) => ({
    id: r.id, // ✅ real ChatChannelMember id
    userId: r.userId,
    role: roleByUserId.get(r.userId) ?? null, // ✅ overlay
    createdAt: r.createdAt,
    removedAt: r.removedAt,
    user: r.user,
  }));

  return ok({
    ok: true,
    workspaceId: a.workspaceId,
    channelId: a.channel.id, // ✅ UI-friendly
    channel: a.channel,
    members,
  });
}

export async function POST(req: Request, ctx: { params: { channelId: string } }) {
  const aRaw = await requireChannelAccess(ctx.params.channelId);
  if (!aRaw.ok) return fromLib(aRaw);

  const a = channelCtxOr500(aRaw);
  if (!a) return err("Channel context missing", 500);

  if (!isElevated(a.workspaceRole)) return err("Only OWNER/ADMIN can manage members", 403);
  if (isBoardChannel(a.channel)) return err("Board membership is workspace-wide", 400);
  if (isDMChannel(a.channel)) return err("DM members cannot be modified", 400);
  if (!a.channel.isPrivate) return err("Members are only managed for private rooms", 400);

  const body = await req.json().catch(() => null);
  if (!body) return err("Invalid JSON", 400);

  const userIds: string[] = Array.isArray(body.userIds) ? body.userIds.map(String) : [];
  const unique = Array.from(new Set(userIds)).filter(Boolean);
  if (!unique.length) return err("userIds required", 400);

  // ✅ Only allow adding users who are in this workspace (and not removed)
  const allowed = await prisma.workspaceUser.findMany({
    where: { workspaceId: a.workspaceId, userId: { in: unique }, removedAt: null },
    select: { userId: true },
  });
  const allowedIds = allowed.map((x) => x.userId);
  if (!allowedIds.length) return err("No valid workspace members provided", 400);

  await prisma.chatChannelMember.createMany({
    data: allowedIds.map((userId) => ({
      workspaceId: a.workspaceId,
      channelId: a.channel.id,
      userId,
    })),
    skipDuplicates: true,
  });

  return ok({
    ok: true,
    workspaceId: a.workspaceId,
    channelId: a.channel.id,
    added: allowedIds.length,
  });
}

export async function DELETE(req: Request, ctx: { params: { channelId: string } }) {
  const aRaw = await requireChannelAccess(ctx.params.channelId);
  if (!aRaw.ok) return fromLib(aRaw);

  const a = channelCtxOr500(aRaw);
  if (!a) return err("Channel context missing", 500);

  if (!isElevated(a.workspaceRole)) return err("Only OWNER/ADMIN can manage members", 403);
  if (isBoardChannel(a.channel)) return err("Board membership is workspace-wide", 400);
  if (isDMChannel(a.channel)) return err("DM members cannot be modified", 400);
  if (!a.channel.isPrivate) return err("Members are only managed for private rooms", 400);

  const sp = new URL(req.url).searchParams;
  const userId = sp.get("userId");
  if (!userId) return err("Missing userId", 400);

  // ✅ Don’t allow removing someone who isn't a workspace member (defense-in-depth)
  const wu = await prisma.workspaceUser.findFirst({
    where: { workspaceId: a.workspaceId, userId, removedAt: null },
    select: { userId: true },
  });
  if (!wu) return err("User is not an active workspace member", 400);

  await prisma.chatChannelMember.updateMany({
    where: { workspaceId: a.workspaceId, channelId: a.channel.id, userId, removedAt: null },
    data: { removedAt: new Date() },
  });

  return ok({
    ok: true,
    workspaceId: a.workspaceId,
    channelId: a.channel.id,
    removed: true,
  });
}
// lib/chat/channels.ts
import { prisma } from "@/lib/prisma";
import { requireChatWorkspace, requireChannelAccess, isElevated } from "./access";

type CreateChannelInput =
  | {
      type: "ROOM";
      key?: string;
      name: string;
      isPrivate?: boolean;
      memberUserIds?: string[];
    }
  | {
      type: "DM";
      key?: string;
      name?: string;
      isPrivate?: boolean;
      memberUserIds: string[]; // should contain the "other" user (UI sends one id)
    };

function slugifyKey(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function dmKey(workspaceId: string, a: string, b: string) {
  const [u1, u2] = [a, b].sort();
  return `dm_${workspaceId}_${u1}_${u2}`.slice(0, 48);
}

export async function ensureWorkspaceBoard() {
  const ws = await requireChatWorkspace();
  if (!ws.ok) return ws;

  const channel = await prisma.chatChannel.upsert({
    where: { workspaceId_key: { workspaceId: ws.workspaceId, key: "board" } },
    update: { archivedAt: null, archivedByUserId: null },
    create: {
      workspaceId: ws.workspaceId,
      type: "BOARD",
      key: "board",
      name: "Workspace Board",
      isPrivate: false,
      createdByUserId: ws.userId,
    },
    select: { id: true, workspaceId: true, type: true, key: true, name: true, isPrivate: true },
  });

  // ensure the creator has a readState row
  await prisma.chatReadState.upsert({
    where: { channelId_userId: { channelId: channel.id, userId: ws.userId } },
    update: { lastReadAt: new Date() },
    create: { workspaceId: ws.workspaceId, channelId: channel.id, userId: ws.userId, lastReadAt: new Date() },
  });

  return { ok: true as const, ...ws, channel };
}

export async function listChannels(opts?: { includeArchived?: boolean; limit?: number }) {
  const ws = await requireChatWorkspace();
  if (!ws.ok) return ws;

  const includeArchived = !!opts?.includeArchived;
  const limit = Math.max(1, Math.min(200, opts?.limit ?? 100));

  const privateMemberships = await prisma.chatChannelMember.findMany({
    where: { workspaceId: ws.workspaceId, userId: ws.userId, removedAt: null },
    select: { channelId: true },
  });

  const privateIds = privateMemberships.map((x) => x.channelId);

  const channels = await prisma.chatChannel.findMany({
    where: {
      workspaceId: ws.workspaceId,
      ...(includeArchived ? {} : { archivedAt: null }),
      OR: [{ isPrivate: false }, { id: { in: privateIds } }],
    },
    orderBy: [{ type: "asc" }, { lastMessageAt: "desc" }, { updatedAt: "desc" }],
    take: limit,
    select: {
      id: true,
      workspaceId: true,
      type: true,
      key: true,
      name: true,
      isPrivate: true,
      lastMessageAt: true,
      archivedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const channelIds = channels.map((c) => c.id);

  const readStates = channelIds.length
    ? await prisma.chatReadState.findMany({
        where: {
          workspaceId: ws.workspaceId,
          userId: ws.userId,
          channelId: { in: channelIds },
        },
        select: {
          channelId: true,
          lastReadAt: true,
          lastReadMessageId: true,
        },
      })
    : [];

  const readByChannelId = new Map<string, { lastReadAt: Date | null; lastReadMessageId: string | null }>();
  for (const rs of readStates) {
    readByChannelId.set(rs.channelId, {
      lastReadAt: rs.lastReadAt ?? null,
      lastReadMessageId: rs.lastReadMessageId ?? null,
    });
  }

  const enriched = channels.map((c) => {
    const rs = readByChannelId.get(c.id) || { lastReadAt: null, lastReadMessageId: null };
    return {
      ...c,
      readState: {
        lastReadAt: rs.lastReadAt,
        lastReadMessageId: rs.lastReadMessageId,
      },
    };
  });

  return { ok: true as const, ...ws, channels: enriched };
}

export async function createChannel(input: CreateChannelInput) {
  const ws = await requireChatWorkspace();
  if (!ws.ok) return ws;

  if (input.type === "DM") {
    // DM must include exactly one *other* member (besides requester)
    const requestedOthers = Array.from(new Set((input.memberUserIds || []).filter(Boolean))).filter(
      (id) => id !== ws.userId
    );

    if (requestedOthers.length !== 1) {
      return { ok: false as const, status: 400, error: { error: "DM must include exactly one other workspace member." } };
    }

    const otherUserId = requestedOthers[0];

    // Must be an ACTIVE workspace member
    const otherMember = await prisma.workspaceUser.findFirst({
      where: { workspaceId: ws.workspaceId, userId: otherUserId, removedAt: null },
      select: { userId: true },
    });

    if (!otherMember) {
      return { ok: false as const, status: 403, error: { error: "You can only start DMs with members of your workspace." } };
    }

    const key = input.key ?? dmKey(ws.workspaceId, ws.userId, otherUserId);

    // Upsert prevents duplicate DMs between same pair in the same workspace
    const channel = await prisma.chatChannel.upsert({
      where: { workspaceId_key: { workspaceId: ws.workspaceId, key } },
      update: { archivedAt: null, archivedByUserId: null },
      create: {
        workspaceId: ws.workspaceId,
        type: "DM",
        key,
        name: input.name ?? "Direct Message",
        isPrivate: true,
        createdByUserId: ws.userId,
      },
      select: { id: true, workspaceId: true, type: true, key: true, name: true, isPrivate: true },
    });

    // Ensure exactly the two participants are members
    await prisma.chatChannelMember.createMany({
      data: [
        { workspaceId: ws.workspaceId, channelId: channel.id, userId: ws.userId },
        { workspaceId: ws.workspaceId, channelId: channel.id, userId: otherUserId },
      ],
      skipDuplicates: true,
    });

    // Ensure requestor has readState (nice for immediate UX)
    await prisma.chatReadState.upsert({
      where: { channelId_userId: { channelId: channel.id, userId: ws.userId } },
      update: {},
      create: { workspaceId: ws.workspaceId, channelId: channel.id, userId: ws.userId },
    });

    return { ok: true as const, ...ws, channel };
  }

  // ROOM
  const isPrivate = input.isPrivate ?? false;
  const name = input.name;
  const key =
    input.key && input.key.trim().length
      ? slugifyKey(input.key)
      : slugifyKey(name) || `room-${Math.random().toString(36).slice(2, 8)}`;

  // Create room channel
  const channel = await prisma.chatChannel.create({
    data: {
      workspaceId: ws.workspaceId,
      type: "ROOM",
      key,
      name,
      isPrivate,
      createdByUserId: ws.userId,
    },
    select: { id: true, workspaceId: true, type: true, key: true, name: true, isPrivate: true },
  });

  // For private rooms, enforce members and ensure they’re workspace members
  if (channel.isPrivate) {
    const requested = Array.from(new Set([ws.userId, ...(input.memberUserIds ?? [])])).filter(Boolean);

    const allowed = await prisma.workspaceUser.findMany({
      where: { workspaceId: ws.workspaceId, userId: { in: requested }, removedAt: null },
      select: { userId: true },
    });

    const allowedIds = allowed.map((x) => x.userId);

    await prisma.chatChannelMember.createMany({
      data: allowedIds.map((userId) => ({ workspaceId: ws.workspaceId, channelId: channel.id, userId })),
      skipDuplicates: true,
    });
  }

  // Ensure creator has readState row
  await prisma.chatReadState.upsert({
    where: { channelId_userId: { channelId: channel.id, userId: ws.userId } },
    update: {},
    create: { workspaceId: ws.workspaceId, channelId: channel.id, userId: ws.userId },
  });

  return { ok: true as const, ...ws, channel };
}

export async function patchChannel(
  channelId: string,
  patch: { name?: string; isPrivate?: boolean; archived?: boolean }
) {
  const a = await requireChannelAccess(channelId);
  if (!a.ok) return a;

  const elevated = isElevated(a.workspaceRole);

  const data: any = {};
  if (typeof patch.name === "string") data.name = patch.name;

  if (typeof patch.isPrivate === "boolean") {
    if (!elevated) return { ok: false as const, status: 403, error: { error: "Only OWNER/ADMIN can change privacy" } };
    data.isPrivate = patch.isPrivate;
  }

  if (typeof patch.archived === "boolean") {
    if (!elevated) return { ok: false as const, status: 403, error: { error: "Only OWNER/ADMIN can archive channels" } };
    data.archivedAt = patch.archived ? new Date() : null;
    data.archivedByUserId = patch.archived ? a.userId : null;
  }

  const channel = await prisma.chatChannel.update({
    where: { id: channelId },
    data,
    select: { id: true, workspaceId: true, type: true, key: true, name: true, isPrivate: true, archivedAt: true },
  });

  return { ok: true as const, ...a, channel };
}
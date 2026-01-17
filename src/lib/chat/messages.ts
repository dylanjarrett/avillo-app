// lib/chat/messages.ts
import { prisma } from "@/lib/prisma";
import { requireChannelAccess } from "./access";

export async function listMessages(params: {
  channelId: string;
  limit?: number;
  cursorId?: string | null; // messageId
  direction?: "backward" | "forward";
}) {
  const a = await requireChannelAccess(params.channelId);
  if (!a.ok) return a;

  const limit = Math.max(1, Math.min(200, params.limit ?? 50));
  const direction = params.direction ?? "backward";

  const cursorMsg = params.cursorId
    ? await prisma.chatMessage.findUnique({
        where: { id: params.cursorId },
        select: { id: true, createdAt: true },
      })
    : null;

  const where: any = {
    workspaceId: a.workspaceId,
    channelId: params.channelId,
    isVisible: true,
    deletedAt: null,
  };

  // ✅ Deterministic cursoring: compare (createdAt, id)
  if (cursorMsg) {
    where.OR =
      direction === "backward"
        ? [
            { createdAt: { lt: cursorMsg.createdAt } },
            { createdAt: cursorMsg.createdAt, id: { lt: cursorMsg.id } },
          ]
        : [
            { createdAt: { gt: cursorMsg.createdAt } },
            { createdAt: cursorMsg.createdAt, id: { gt: cursorMsg.id } },
          ];
  }

  const orderBy =
    direction === "backward"
      ? ([{ createdAt: "desc" as const }, { id: "desc" as const }] as const)
      : ([{ createdAt: "asc" as const }, { id: "asc" as const }] as const);

  const items = await prisma.chatMessage.findMany({
    where,
    orderBy: orderBy as any,
    take: limit,
    select: {
      id: true,
      workspaceId: true,
      channelId: true,
      authorUserId: true,
      type: true,
      status: true,
      clientNonce: true,
      parentId: true,
      body: true,
      editedAt: true,
      editedByUserId: true,
      deletedAt: true,
      deletedByUserId: true,
      isVisible: true,
      payload: true,
      createdAt: true,
      reactions: { select: { id: true, userId: true, emoji: true, createdAt: true } },
      mentions: { select: { id: true, mentionedUserId: true, createdAt: true } },
    },
  });

  // UI expects oldest -> newest
  const messages = direction === "backward" ? items.slice().reverse() : items;

  return {
    ok: true as const,
    ...a,
    messages,
    // consistent naming for your UI:
    nextCursor: messages.length ? messages[0].id : null, // oldest in this page
    prevCursor: messages.length ? messages[messages.length - 1].id : null, // newest in this page
  };
}

export async function createMessage(input: {
  channelId: string;
  body: string;
  type?: "TEXT" | "SYSTEM";
  parentId?: string | null;
  clientNonce: string;
  mentionedUserIds?: string[];
}) {
  const a = await requireChannelAccess(input.channelId);
  if (!a.ok) return a;

  if (!("channel" in a) || !a.channel) {
    return { ok: false as const, status: 500, error: { error: "Channel context missing" } };
  }

  if (a.channel.archivedAt) {
    return { ok: false as const, status: 409, error: { error: "Channel is archived" } };
  }

  const body = String(input.body || "").trim();
  if (!body) {
    return { ok: false as const, status: 400, error: { error: "Body required" } };
  }

  // idempotency (author + channel + clientNonce)
  const existing = await prisma.chatMessage.findFirst({
    where: {
      channelId: input.channelId,
      authorUserId: a.userId,
      clientNonce: input.clientNonce,
      deletedAt: null,
    },
    select: { id: true },
  });

  if (existing) {
    const message = await prisma.chatMessage.findUnique({
      where: { id: existing.id },
      select: { id: true, createdAt: true },
    });
    return { ok: true as const, ...a, message, idempotent: true as const };
  }

  const now = new Date();

  const message = await prisma.$transaction(async (tx) => {
    const m = await tx.chatMessage.create({
      data: {
        workspaceId: a.workspaceId,
        channelId: input.channelId,
        authorUserId: a.userId,
        type: input.type ?? "TEXT",
        status: "SENT",
        clientNonce: input.clientNonce,
        parentId: input.parentId ?? null,
        body,
        createdAt: now,
      },
      select: {
        id: true,
        workspaceId: true,
        channelId: true,
        authorUserId: true,
        type: true,
        status: true,
        clientNonce: true,
        parentId: true,
        body: true,
        createdAt: true,
      },
    });

    // mentions: only allow active workspace members
    if (input.mentionedUserIds?.length) {
      const unique = Array.from(new Set(input.mentionedUserIds.map(String))).filter(Boolean);

      if (unique.length) {
        const allowed = await tx.workspaceUser.findMany({
          where: { workspaceId: a.workspaceId, userId: { in: unique }, removedAt: null },
          select: { userId: true },
        });

        const allowedIds = allowed.map((x) => x.userId);

        if (allowedIds.length) {
          await tx.chatMention.createMany({
            data: allowedIds.map((mentionedUserId) => ({
              workspaceId: a.workspaceId,
              messageId: m.id,
              mentionedUserId,
            })),
            skipDuplicates: true,
          });
        }
      }
    }

    // advance channel lastMessageAt
    await tx.chatChannel.update({
      where: { id: input.channelId },
      data: { lastMessageAt: now },
    });

    // ✅ sender should never see their own message as unread
    await tx.chatReadState.upsert({
      where: { channelId_userId: { channelId: input.channelId, userId: a.userId } },
      update: { lastReadAt: now, lastReadMessageId: m.id },
      create: {
        workspaceId: a.workspaceId,
        channelId: input.channelId,
        userId: a.userId,
        lastReadAt: now,
        lastReadMessageId: m.id,
      },
    });

    return m;
  });

  return { ok: true as const, ...a, message };
}

export async function editMessage(messageId: string, body: string) {
  const msg = await prisma.chatMessage.findUnique({
    where: { id: messageId },
    select: { id: true, channelId: true, authorUserId: true, deletedAt: true, isVisible: true },
  });

  if (!msg) return { ok: false as const, status: 404, error: { error: "Message not found" } };

  const a = await requireChannelAccess(msg.channelId);
  if (!a.ok) return a;

  const elevated = a.workspaceRole === "OWNER" || a.workspaceRole === "ADMIN";
  const isAuthor = msg.authorUserId === a.userId;

  if (!isAuthor && !elevated) {
    return { ok: false as const, status: 403, error: { error: "Not authorized to edit this message" } };
  }

  if (msg.deletedAt || !msg.isVisible) {
    return { ok: false as const, status: 409, error: { error: "Message is deleted" } };
  }

  const nextBody = String(body || "").trim();
  if (!nextBody) {
    return { ok: false as const, status: 400, error: { error: "Body required" } };
  }

  const updated = await prisma.chatMessage.update({
    where: { id: messageId },
    data: { body: nextBody, editedAt: new Date(), editedByUserId: a.userId },
    select: { id: true, body: true, editedAt: true, editedByUserId: true },
  });

  return { ok: true as const, ...a, message: updated };
}

export async function deleteMessage(messageId: string) {
  const msg = await prisma.chatMessage.findUnique({
    where: { id: messageId },
    select: { id: true, channelId: true, authorUserId: true, deletedAt: true, isVisible: true },
  });

  if (!msg) return { ok: false as const, status: 404, error: { error: "Message not found" } };

  const a = await requireChannelAccess(msg.channelId);
  if (!a.ok) return a;

  // requirement: author can always delete their own message (any role)
  if (msg.authorUserId !== a.userId) {
    return { ok: false as const, status: 403, error: { error: "You can only delete your own messages" } };
  }

  if (msg.deletedAt || !msg.isVisible) {
    return { ok: true as const, ...a, deleted: true as const };
  }

  const updated = await prisma.chatMessage.update({
    where: { id: messageId },
    data: {
      deletedAt: new Date(),
      deletedByUserId: a.userId,
      isVisible: false,
    },
    select: { id: true, deletedAt: true, deletedByUserId: true, isVisible: true },
  });

  return { ok: true as const, ...a, message: updated };
}
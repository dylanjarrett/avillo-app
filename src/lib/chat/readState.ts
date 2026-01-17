// lib/chat/readState.ts
import { prisma } from "@/lib/prisma";
import { requireChannelAccess } from "./access";

export async function markRead(channelId: string, lastReadMessageId?: string | null) {
  const a = await requireChannelAccess(channelId);
  if (!a.ok) return a;

  // 1) Load existing read state (if any)
  const existing = await prisma.chatReadState.findUnique({
    where: { channelId_userId: { channelId, userId: a.userId } },
    select: { lastReadMessageId: true, lastReadAt: true },
  });

  // 2) Validate candidate message id (must belong to this channel/workspace and not be deleted)
  let candidateId: string | null = lastReadMessageId ?? null;
  let candidateCreatedAt: Date | null = null;

  if (candidateId) {
    const m = await prisma.chatMessage.findFirst({
      where: {
        id: candidateId,
        workspaceId: a.workspaceId,
        channelId,
        deletedAt: null,
      },
      select: { id: true, createdAt: true },
    });

    if (!m) {
      candidateId = null;
    } else {
      candidateCreatedAt = m.createdAt;
    }
  }

  // 3) If we have an existing pointer and a candidate pointer, ensure we never move backwards.
  // We compare by createdAt to decide which one is “newer”.
  let finalId: string | null = candidateId;

  if (existing?.lastReadMessageId) {
    if (!finalId) {
      // caller provided nothing/invalid → keep existing pointer
      finalId = existing.lastReadMessageId;
    } else {
      // compare createdAt of candidate vs existing
      const exMsg = await prisma.chatMessage.findFirst({
        where: {
          id: existing.lastReadMessageId,
          workspaceId: a.workspaceId,
          channelId,
          deletedAt: null,
        },
        select: { createdAt: true },
      });

      // If we can’t find the existing message (deleted), allow candidate to become the pointer.
      if (exMsg?.createdAt && candidateCreatedAt) {
        const exTime = exMsg.createdAt.getTime();
        const candTime = candidateCreatedAt.getTime();

        // If candidate is older than existing, keep existing.
        if (candTime < exTime) finalId = existing.lastReadMessageId;
      }
    }
  }

  const now = new Date();

  // 4) Upsert the read state (monotonic pointer, always refresh lastReadAt)
  const readState = await prisma.chatReadState.upsert({
    where: { channelId_userId: { channelId, userId: a.userId } },
    update: { lastReadMessageId: finalId, lastReadAt: now },
    create: {
      workspaceId: a.workspaceId,
      channelId,
      userId: a.userId,
      lastReadMessageId: finalId,
      lastReadAt: now,
    },
    select: { id: true, channelId: true, userId: true, lastReadMessageId: true, lastReadAt: true },
  });

  return { ok: true as const, ...a, readState };
}
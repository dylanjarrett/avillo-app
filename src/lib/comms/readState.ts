// src/lib/comms/readState.ts
import { prisma } from "@/lib/prisma";

export async function markCommsRead(args: {
  workspaceId: string;
  userId: string;
  conversationId: string;
  lastReadEventId: string | null;
}) {
  const { workspaceId, userId, conversationId } = args;

  // 1) Load existing read state (if any)
  const existing = await prisma.commReadState.findUnique({
    where: {
      conversationId_userId: {
        conversationId,
        userId,
      },
    },
    select: { lastReadEventId: true, lastReadAt: true },
  });

  // 2) Validate candidate event id (must belong to this conversation/workspace)
  let candidateId: string | null = args.lastReadEventId ?? null;
  let candidateOccurredAt: Date | null = null;

  if (candidateId) {
    const e = await prisma.commEvent.findFirst({
      where: {
        id: candidateId,
        workspaceId,
        conversationId,
      },
      select: { id: true, occurredAt: true },
    });

    if (!e) {
      candidateId = null;
    } else {
      candidateOccurredAt = e.occurredAt;
    }
  }

  // 3) Ensure we never move backwards (compare occurredAt)
  let finalId: string | null = candidateId;

  if (existing?.lastReadEventId) {
    if (!finalId) {
      // caller provided nothing/invalid → keep existing pointer
      finalId = existing.lastReadEventId;
    } else {
      const ex = await prisma.commEvent.findFirst({
        where: {
          id: existing.lastReadEventId,
          workspaceId,
          conversationId,
        },
        select: { occurredAt: true },
      });

      // If we can’t find the existing event, allow candidate to win
      if (ex?.occurredAt && candidateOccurredAt) {
        const exTime = ex.occurredAt.getTime();
        const candTime = candidateOccurredAt.getTime();

        if (candTime < exTime) finalId = existing.lastReadEventId;
      }
    }
  }

  const now = new Date();

  // 4) Upsert read state
  return prisma.commReadState.upsert({
    where: {
      conversationId_userId: {
        conversationId,
        userId,
      },
    },
    create: {
      workspaceId,
      conversationId,
      userId,
      lastReadEventId: finalId,
      lastReadAt: now,
    },
    update: {
      lastReadEventId: finalId,
      lastReadAt: now,
    },
    select: {
      id: true,
      conversationId: true,
      userId: true,
      lastReadEventId: true,
      lastReadAt: true,
    },
  });
}
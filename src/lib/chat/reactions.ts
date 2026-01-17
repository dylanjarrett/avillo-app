//lib/chat/reactions
import { prisma } from "@/lib/prisma";
import { requireChannelAccess } from "./access";

export async function toggleReaction(input: { messageId: string; emoji: string }) {
  const msg = await prisma.chatMessage.findUnique({
    where: { id: input.messageId },
    select: { id: true, workspaceId: true, channelId: true, deletedAt: true, isVisible: true },
  });

  if (!msg) return { ok: false as const, status: 404, error: { error: "Message not found" } };

  const a = await requireChannelAccess(msg.channelId);
  if (!a.ok) return a;

  if (msg.deletedAt || !msg.isVisible) {
    return { ok: false as const, status: 409, error: { error: "Message is deleted" } };
  }

  const existing = await prisma.chatReaction.findFirst({
    where: { messageId: msg.id, userId: a.userId, emoji: input.emoji },
    select: { id: true },
  });

  if (existing) {
    await prisma.chatReaction.delete({ where: { id: existing.id } });
    return { ok: true as const, ...a, toggled: "removed" as const };
  }

  await prisma.chatReaction.create({
    data: {
      workspaceId: a.workspaceId,
      messageId: msg.id,
      userId: a.userId,
      emoji: input.emoji,
    },
  });

  return { ok: true as const, ...a, toggled: "added" as const };
}

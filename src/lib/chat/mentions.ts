// lib/chat/mentions.ts
import { prisma } from "@/lib/prisma";

/**
 * Utility used by message creation (not typically called directly).
 */
export async function createMentions(
  workspaceId: string,
  messageId: string,
  mentionedUserIds: string[]
) {
  const unique = Array.from(new Set(mentionedUserIds)).filter(Boolean);
  if (!unique.length) return;

  await prisma.chatMention.createMany({
    data: unique.map((mentionedUserId) => ({
      workspaceId,
      messageId,
      mentionedUserId,
    })),
    skipDuplicates: true,
  });
}
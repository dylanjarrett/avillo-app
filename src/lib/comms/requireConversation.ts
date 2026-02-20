// src/lib/comms/requireConversation.ts
import { prisma } from "@/lib/prisma";

export async function requireConversation(args: {
  workspaceId: string;
  userId: string;
  conversationId: string;
}) {
  const convo = await prisma.conversation.findFirst({
    where: {
      id: args.conversationId,
      workspaceId: args.workspaceId,
      assignedToUserId: args.userId,
    },
    select: {
      id: true,
      workspaceId: true,
      assignedToUserId: true,
    },
  });

  if (!convo) {
    const err = new Error("Conversation not found") as Error & { status?: number };
    err.status = 404;
    throw err;
  }

  return convo;
}
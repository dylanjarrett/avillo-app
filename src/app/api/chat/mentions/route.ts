// src/app/api/chat/mentions/route.ts
import { prisma } from "@/lib/prisma";
import { requireChatWorkspace } from "@/lib/chat/access";
import { clampInt, getSearchParams } from "@/lib/chat/pagination";
import { fromLib, ok } from "@/lib/chat/response";

export async function GET(req: Request) {
  const ws = await requireChatWorkspace();
  if (!ws.ok) return fromLib(ws);

  const sp = getSearchParams(req);
  const limit = clampInt(sp.get("limit"), 50, 1, 200);

  const mentions = await prisma.chatMention.findMany({
    where: {
      workspaceId: ws.workspaceId,
      mentionedUserId: ws.userId,
      message: {
        deletedAt: null,
        isVisible: true,
        channel: {
          archivedAt: null,
          OR: [
            // public channels
            { isPrivate: false },
            // private channels where user is a member
            {
              memberships: {
                some: {
                  userId: ws.userId,
                  removedAt: null,
                },
              },
            },
          ],
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      createdAt: true,
      messageId: true,
      message: {
        select: {
          id: true,
          channelId: true,
          body: true,
          createdAt: true,
          authorUserId: true,
          channel: {
            select: {
              id: true,
              type: true,
              key: true,
              name: true,
              isPrivate: true,
              archivedAt: true,
            },
          },
        },
      },
    },
  });

  return ok({ ok: true, workspaceId: ws.workspaceId, mentions });
}
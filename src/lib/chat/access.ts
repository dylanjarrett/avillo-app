//lib/chat/access
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";

export type WorkspaceRoleWire = "OWNER" | "ADMIN" | "AGENT" | string;

export function isElevated(role: WorkspaceRoleWire) {
  return role === "OWNER" || role === "ADMIN";
}

/**
 * Uses your existing workspace selection + membership enforcement.
 */
export async function requireChatWorkspace() {
  return requireWorkspace();
}

/**
 * Ensures:
 * - channel exists
 * - channel belongs to current workspace
 * - if channel is private, requester is an active channel member
 */
export async function requireChannelAccess(channelId: string) {
  const ws = await requireChatWorkspace();
  if (!ws.ok) return ws;

  const channel = await prisma.chatChannel.findUnique({
    where: { id: channelId },
    select: {
      id: true,
      workspaceId: true,
      type: true,
      key: true,
      name: true,
      isPrivate: true,
      archivedAt: true,
      lastMessageAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!channel || channel.workspaceId !== ws.workspaceId) {
    return { ok: false as const, status: 404, error: { error: "Channel not found" } };
  }

  if (channel.isPrivate) {
    const member = await prisma.chatChannelMember.findFirst({
      where: { channelId: channel.id, userId: ws.userId, removedAt: null },
      select: { id: true },
    });

    if (!member) {
      return { ok: false as const, status: 403, error: { error: "Not authorized for this channel" } };
    }
  }

    // Safety: DMs must always require membership, even if isPrivate is mis-set
  if (channel.type === "DM") {
    const member = await prisma.chatChannelMember.findFirst({
      where: { channelId: channel.id, userId: ws.userId, removedAt: null },
      select: { id: true },
    });

    if (!member) {
      return { ok: false as const, status: 403, error: { error: "Not authorized for this DM" } };
    }
  }

  return { ok: true as const, ...ws, channel };
}

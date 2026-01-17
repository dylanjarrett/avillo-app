// lib/chat/validators.ts
import { z } from "zod";

export const ChatChannelTypeSchema = z.enum(["BOARD", "ROOM", "DM"]);
export const ChatMessageTypeSchema = z.enum(["TEXT", "SYSTEM"]);

/**
 * CreateChannel
 * - ROOM: requires name, optional key (server can generate if omitted)
 * - DM: requires memberUserIds (server enforces exactly one other participant)
 *
 * IMPORTANT: UI should send for DM:
 *   { type: "DM", memberUserIds: ["<otherUserId>"] }
 */
export const CreateChannelSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("ROOM"),
    name: z.string().min(1).max(120),
    key: z.string().min(1).max(48).optional(),
    isPrivate: z.boolean().optional().default(false),
    memberUserIds: z.array(z.string()).optional(),
  }),
  z.object({
    type: z.literal("DM"),
    memberUserIds: z.array(z.string()).min(1).max(10),
    key: z.string().min(1).max(48).optional(),
    name: z.string().min(1).max(120).optional(),
    isPrivate: z.boolean().optional(),
  }),
]);

export const PatchChannelSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  isPrivate: z.boolean().optional(),
  archived: z.boolean().optional(),
});

export const CreateMessageSchema = z.object({
  body: z.string().min(1).max(20000),
  type: ChatMessageTypeSchema.optional().default("TEXT"),
  parentId: z.string().nullable().optional(),

  // required for idempotency (unique on channelId+authorUserId+clientNonce)
  clientNonce: z.string().min(6).max(64),

  mentionedUserIds: z.array(z.string()).optional(),
});

export const PatchMessageSchema = z.object({
  body: z.string().min(1).max(20000),
});

export const ToggleReactionSchema = z.object({
  emoji: z.string().min(1).max(32),
});

export const MarkReadSchema = z.object({
  lastReadMessageId: z.string().nullable().optional(),
});
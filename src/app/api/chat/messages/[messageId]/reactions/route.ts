//api/chat/messages/[messageId]/reactions/route
import { toggleReaction } from "@/lib/chat/reactions";
import { ToggleReactionSchema } from "@/lib/chat/validators";
import { err, fromLib } from "@/lib/chat/response";

export async function POST(req: Request, ctx: { params: { messageId: string } }) {
  const body = await req.json().catch(() => null);
  if (!body) return err("Invalid JSON");

  const parsed = ToggleReactionSchema.safeParse(body);
  if (!parsed.success) return err(parsed.error.message, 400);

  const res = await toggleReaction({ messageId: ctx.params.messageId, emoji: parsed.data.emoji });
  return fromLib(res, 200);
}

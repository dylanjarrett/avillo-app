//api/chat/messages/[messageId]/route
import { editMessage, deleteMessage } from "@/lib/chat/messages";
import { PatchMessageSchema } from "@/lib/chat/validators";
import { err, fromLib } from "@/lib/chat/response";

export async function PATCH(req: Request, ctx: { params: { messageId: string } }) {
  const body = await req.json().catch(() => null);
  if (!body) return err("Invalid JSON");

  const parsed = PatchMessageSchema.safeParse(body);
  if (!parsed.success) return err(parsed.error.message, 400);

  const res = await editMessage(ctx.params.messageId, parsed.data.body);
  return fromLib(res, 200);
}

export async function DELETE(_: Request, ctx: { params: { messageId: string } }) {
  const res = await deleteMessage(ctx.params.messageId);
  return fromLib(res, 200);
}

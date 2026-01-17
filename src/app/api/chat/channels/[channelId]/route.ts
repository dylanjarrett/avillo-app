//api/chat/channels/[channelId]/route
import { requireChannelAccess } from "@/lib/chat/access";
import { patchChannel } from "@/lib/chat/channels";
import { PatchChannelSchema } from "@/lib/chat/validators";
import { err, fromLib, ok } from "@/lib/chat/response";

export async function GET(_: Request, ctx: { params: { channelId: string } }) {
  const res = await requireChannelAccess(ctx.params.channelId);
  return fromLib(res, 200);
}

export async function PATCH(req: Request, ctx: { params: { channelId: string } }) {
  const body = await req.json().catch(() => null);
  if (!body) return err("Invalid JSON");

  const parsed = PatchChannelSchema.safeParse(body);
  if (!parsed.success) return err(parsed.error.message, 400);

  const res = await patchChannel(ctx.params.channelId, parsed.data);
  return fromLib(res, 200);
}

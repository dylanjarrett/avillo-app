// app/api/chat/channels/[channelId]/read/route.ts
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { markRead } from "@/lib/chat/readState";
import { MarkReadSchema } from "@/lib/chat/validators";
import { err, fromLib } from "@/lib/chat/response";

export async function POST(req: Request, ctx: { params: { channelId: string } }) {
  const body = await req.json().catch(() => ({}));

  const parsed = MarkReadSchema.safeParse(body ?? {});
  if (!parsed.success) return err(parsed.error.message, 400);

  const res = await markRead(ctx.params.channelId, parsed.data.lastReadMessageId ?? null);
  const out = fromLib(res, 200);

  // ✅ prevent any intermediate caching layers from serving stale readState
  out.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  out.headers.set("Pragma", "no-cache");

  return out;
}
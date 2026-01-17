//api/chat/channels/[channelId]/messages/route
import { listMessages, createMessage } from "@/lib/chat/messages";
import { clampInt, getSearchParams } from "@/lib/chat/pagination";
import { CreateMessageSchema } from "@/lib/chat/validators";
import { err, fromLib } from "@/lib/chat/response";

export async function GET(req: Request, ctx: { params: { channelId: string } }) {
  const sp = getSearchParams(req);

  const limit = clampInt(sp.get("limit"), 50, 1, 200);
  const cursorId = sp.get("cursorId");
  const direction = (sp.get("direction") as any) || "backward";

  const res = await listMessages({
    channelId: ctx.params.channelId,
    limit,
    cursorId: cursorId || null,
    direction: direction === "forward" ? "forward" : "backward",
  });

  return fromLib(res, 200);
}

export async function POST(req: Request, ctx: { params: { channelId: string } }) {
  const body = await req.json().catch(() => null);
  if (!body) return err("Invalid JSON");

  const parsed = CreateMessageSchema.safeParse(body);
  if (!parsed.success) return err(parsed.error.message, 400);

  const res = await createMessage({
    channelId: ctx.params.channelId,
    ...parsed.data,
  });

  // createMessage handles idempotency; still fine to return 201
  return fromLib(res, 201);
}

// app/api/chat/channels/route.ts
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { listChannels, createChannel } from "@/lib/chat/channels";
import { clampInt, getSearchParams } from "@/lib/chat/pagination";
import { CreateChannelSchema } from "@/lib/chat/validators";
import { err, fromLib } from "@/lib/chat/response";

function formatZodErrorMessage(e: any) {
  const issues = e?.issues;
  if (!Array.isArray(issues) || issues.length === 0) return "Invalid input";
  return issues
    .map((i: any) => {
      const path = Array.isArray(i.path) && i.path.length ? i.path.join(".") : "input";
      return `${path}: ${i.message}`;
    })
    .join(" | ");
}

export async function GET(req: Request) {
  const sp = getSearchParams(req);
  const includeArchived = sp.get("includeArchived") === "1" || sp.get("includeArchived") === "true";
  const limit = clampInt(sp.get("limit"), 100, 1, 200);

  const res = await listChannels({ includeArchived, limit });
  const out = fromLib(res, 200);

  // ✅ critical: prevent stale channel+readState payloads on hard refresh
  out.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  out.headers.set("Pragma", "no-cache");

  return out;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return err("Invalid JSON", 400);

  const parsed = CreateChannelSchema.safeParse(body);
  if (!parsed.success) return err(formatZodErrorMessage(parsed.error), 400);

  const res = await createChannel(parsed.data as any);
  const out = fromLib(res, 201);

  // ✅ also prevent any caching on mutations (helps Vercel/proxies behave)
  out.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  out.headers.set("Pragma", "no-cache");

  return out;
}
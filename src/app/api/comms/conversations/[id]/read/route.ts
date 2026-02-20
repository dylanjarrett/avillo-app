// src/app/api/comms/conversations/[id]/read/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace";
import { requireEntitlement } from "@/lib/entitlements";
import { requireConversation } from "@/lib/comms/requireConversation";
import { markCommsRead } from "@/lib/comms/readState";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Marks a conversation as read for the authed user ONLY.
 * - user-private: must be assignedToUserId = authed user
 * - workspace-scoped
 * - entitlement-gated
 *
 * Body:
 *  { lastReadEventId?: string | null }
 */
export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  const ws = await requireWorkspace();
  if (!ws.ok) return NextResponse.json(ws.error, { status: ws.status });

  const gate = await requireEntitlement(ws.workspaceId, "COMMS_ACCESS");
  if (!gate.ok) return NextResponse.json(gate.error, { status: 402 });

  const conversationId = String(ctx.params.id || "").trim();
  if (!conversationId) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }

  // Enforce user-private boundary at the conversation level
  await requireConversation({
    workspaceId: ws.workspaceId,
    userId: ws.userId,
    conversationId,
  });

  const body = await req.json().catch(() => ({} as any));
  const lastReadEventId =
    body?.lastReadEventId === undefined ? null : (body?.lastReadEventId as string | null);

  const readState = await markCommsRead({
    workspaceId: ws.workspaceId,
    userId: ws.userId,
    conversationId,
    lastReadEventId,
  });

  const res = NextResponse.json({ ok: true, readState });

  // ✅ prevent any intermediate caching layers from serving stale readState
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.headers.set("Pragma", "no-cache");

  return res;
}
// src/app/api/comms/calls/conversations/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";
import { requireEntitlement } from "@/lib/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseTake(url: URL, def: number, max: number) {
  const raw = Number(url.searchParams.get("take"));
  if (!Number.isFinite(raw)) return def;
  const n = Math.floor(raw);
  return Math.min(Math.max(n, 1), max);
}

/**
 * Lists calls in a conversation, but ONLY if the conversation belongs to the user.
 */
export async function GET(req: NextRequest, ctx: { params: { id: string } }) {
  const ws = await requireWorkspace();
  if (!ws.ok) return NextResponse.json(ws.error, { status: ws.status });

  // ✅ Entitlement gate
  const gate = await requireEntitlement(ws.workspaceId, "COMMS_ACCESS");
  if (!gate.ok) return NextResponse.json(gate.error, { status: 402 });

  const conversationId = String(ctx.params.id || "").trim();
  if (!conversationId) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });

  // ✅ enforce user-private boundary at the conversation level
  const conv = await prisma.conversation.findFirst({
    where: { id: conversationId, workspaceId: ws.workspaceId, assignedToUserId: ws.userId },
    select: { id: true },
  });
  if (!conv) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });

  const url = new URL(req.url);
  const take = parseTake(url, 50, 100);

  const calls = await prisma.call.findMany({
    where: {
      workspaceId: ws.workspaceId,
      conversationId,
      assignedToUserId: ws.userId, // ✅ hard boundary
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }], // tie-breaker for stability
    take,
    select: {
      id: true,
      direction: true,
      status: true,
      fromNumber: true,
      toNumber: true,
      durationSec: true,
      startedAt: true,
      endedAt: true,
      recordingUrl: true,
      error: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ items: calls.reverse() }); // ascending for UI
}
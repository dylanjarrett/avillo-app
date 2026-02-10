// src/app/api/sms/conversations/[id]/messages/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";
import { requireEntitlement } from "@/lib/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * User-private thread view:
 * - only the assigned user can read messages for a conversation
 * - stable pagination using (createdAt, id) cursor
 *
 * Query:
 *  - take: number (default 50, max 200)
 *  - cursorCreatedAt: ISO string
 *  - cursorId: smsMessage id (tie-breaker)
 *
 * Semantics:
 *  - returns items in ascending order for UI
 *  - nextCursor points to the OLDEST message currently returned (for "load older")
 */
export async function GET(req: NextRequest, ctx: { params: { id: string } }) {
  const ws = await requireWorkspace();
  if (!ws.ok) return NextResponse.json(ws.error, { status: ws.status });

  // ✅ Entitlement gate
  const gate = await requireEntitlement(ws.workspaceId, "COMMS_ACCESS");
  if (!gate.ok) return NextResponse.json(gate.error, { status: 402 });

  const conversationId = ctx.params.id;

  // ✅ enforce user-private boundary at the conversation level
  const conv = await prisma.conversation.findFirst({
    where: {
      id: conversationId,
      workspaceId: ws.workspaceId,
      assignedToUserId: ws.userId,
    },
    select: { id: true },
  });

  if (!conv) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });

  const url = new URL(req.url);
  const take = Math.min(Number(url.searchParams.get("take") || 50), 200);

  const cursorCreatedAtRaw = url.searchParams.get("cursorCreatedAt");
  const cursorId = url.searchParams.get("cursorId");

  const where: any = {
    workspaceId: ws.workspaceId,
    conversationId,
    assignedToUserId: ws.userId, // ✅ user-private boundary at message level too
  };

  // Stable cursor: older than (createdAt desc, id desc)
  if (cursorCreatedAtRaw && cursorId) {
    const cursorCreatedAt = new Date(cursorCreatedAtRaw);
    where.OR = [
      { createdAt: { lt: cursorCreatedAt } },
      { createdAt: cursorCreatedAt, id: { lt: cursorId } },
    ];
  }

  const msgsDesc = await prisma.smsMessage.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    select: {
      id: true,
      direction: true,
      fromNumber: true,
      toNumber: true,
      body: true,
      status: true,
      error: true,
      createdAt: true,
      source: true,
      createdByUserId: true,
    },
  });

  const hasMore = msgsDesc.length > take;
  const pageDesc = hasMore ? msgsDesc.slice(0, take) : msgsDesc;

  // Return ascending for UI
  const pageAsc = [...pageDesc].reverse();

  // nextCursor should point to the OLDEST message in this page (for "load older")
  const oldest = pageAsc[0];

  return NextResponse.json({
    items: pageAsc,
    nextCursor:
      hasMore && oldest ? { cursorCreatedAt: oldest.createdAt.toISOString(), cursorId: oldest.id } : null,
  });
}
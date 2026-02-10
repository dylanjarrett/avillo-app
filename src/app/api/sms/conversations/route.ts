// src/app/api/sms/conversations/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";
import { requireEntitlement } from "@/lib/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * User-private inbox:
 * - only returns conversations assigned to the authed user
 * - stable pagination using (updatedAt, id) cursor
 *
 * Query:
 *  - take: number (default 50, max 100)
 *  - cursorUpdatedAt: ISO string
 *  - cursorId: conversation id (tie-breaker)
 */
export async function GET(req: NextRequest) {
  const ws = await requireWorkspace();
  if (!ws.ok) return NextResponse.json(ws.error, { status: ws.status });

  // ✅ Entitlement gate
  const gate = await requireEntitlement(ws.workspaceId, "COMMS_ACCESS");
  if (!gate.ok) return NextResponse.json(gate.error, { status: 402 });

  const url = new URL(req.url);
  const take = Math.min(Number(url.searchParams.get("take") || 50), 100);

  const cursorUpdatedAtRaw = url.searchParams.get("cursorUpdatedAt");
  const cursorId = url.searchParams.get("cursorId");

  const where: any = {
    workspaceId: ws.workspaceId,
    assignedToUserId: ws.userId, // ✅ user-private boundary
  };

  // Stable cursor: fetch items "older than" the cursor (updatedAt desc, id desc)
  if (cursorUpdatedAtRaw && cursorId) {
    const cursorUpdatedAt = new Date(cursorUpdatedAtRaw);

    where.OR = [
      { updatedAt: { lt: cursorUpdatedAt } },
      { updatedAt: cursorUpdatedAt, id: { lt: cursorId } },
    ];
  }

  const items = await prisma.conversation.findMany({
    where,
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: take + 1,
    select: {
      id: true,
      contactId: true,
      listingId: true,
      phoneNumberId: true,
      assignedToUserId: true,
      displayName: true,
      lastMessageAt: true,
      lastInboundAt: true,
      lastOutboundAt: true,
      threadKey: true,
      createdAt: true,
      updatedAt: true,
      contact: { select: { firstName: true, lastName: true, phone: true, email: true } },
    },
  });

  const hasMore = items.length > take;
  const page = hasMore ? items.slice(0, take) : items;

  const last = page[page.length - 1];

  return NextResponse.json({
    items: page,
    nextCursor:
      hasMore && last ? { cursorUpdatedAt: last.updatedAt.toISOString(), cursorId: last.id } : null,
  });
}
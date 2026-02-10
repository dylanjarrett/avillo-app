// src/app/api/calls/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";
import { requireEntitlement } from "@/lib/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * User-private: only returns calls assigned to the authed user.
 * Cursor paging: (createdAt desc, id desc)
 *
 * Query:
 *  - take (default 50, max 100)
 *  - cursorCreatedAt (ISO)
 *  - cursorId
 */
export async function GET(req: NextRequest) {
  const ws = await requireWorkspace();
  if (!ws.ok) return NextResponse.json(ws.error, { status: ws.status });

  // ✅ Entitlement gate
  const gate = await requireEntitlement(ws.workspaceId, "COMMS_ACCESS");
  if (!gate.ok) return NextResponse.json(gate.error, { status: 402 });

  const url = new URL(req.url);
  const take = Math.min(Number(url.searchParams.get("take") || 50), 100);
  const cursorCreatedAtRaw = url.searchParams.get("cursorCreatedAt");
  const cursorId = url.searchParams.get("cursorId");

  const where: any = {
    workspaceId: ws.workspaceId,
    assignedToUserId: ws.userId, // ✅ hard boundary
  };

  if (cursorCreatedAtRaw && cursorId) {
    const cursorCreatedAt = new Date(cursorCreatedAtRaw);
    where.OR = [
      { createdAt: { lt: cursorCreatedAt } },
      { createdAt: cursorCreatedAt, id: { lt: cursorId } },
    ];
  }

  const items = await prisma.call.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
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

      contactId: true,
      listingId: true,
      conversationId: true,
      phoneNumberId: true,

      contact: { select: { firstName: true, lastName: true, phone: true, email: true } },
      listing: { select: { address: true } },
    },
  });

  const hasMore = items.length > take;
  const page = hasMore ? items.slice(0, take) : items;
  const last = page[page.length - 1];

  return NextResponse.json({
    items: page,
    nextCursor:
      hasMore && last
        ? { cursorCreatedAt: last.createdAt.toISOString(), cursorId: last.id }
        : null,
  });
}
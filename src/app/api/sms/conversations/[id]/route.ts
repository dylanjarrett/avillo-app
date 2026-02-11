// src/app/api/sms/conversations/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";
import { requireEntitlement } from "@/lib/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Deletes a conversation thread for the authed user ONLY.
 * - user-private: must be assignedToUserId = authed user
 * - workspace-scoped
 * - entitlement-gated
 *
 * IMPORTANT:
 * If your DB has FK constraints, we delete children first.
 */
export async function DELETE(_req: NextRequest, ctx: { params: { id: string } }) {
  const ws = await requireWorkspace();
  if (!ws.ok) return NextResponse.json(ws.error, { status: ws.status });

  const gate = await requireEntitlement(ws.workspaceId, "COMMS_ACCESS");
  if (!gate.ok) return NextResponse.json(gate.error, { status: 402 });

  const conversationId = String(ctx.params.id || "").trim();
  if (!conversationId) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }

  // Enforce user-private boundary at the conversation level
  const conv = await prisma.conversation.findFirst({
    where: {
      id: conversationId,
      workspaceId: ws.workspaceId,
      assignedToUserId: ws.userId,
    },
    select: { id: true },
  });

  if (!conv) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }

  await prisma.$transaction(async (tx) => {
    // Delete children first (FK-safe)
    await tx.smsMessage.deleteMany({
      where: {
        workspaceId: ws.workspaceId,
        conversationId,
      },
    });

    await tx.call.deleteMany({
      where: {
        workspaceId: ws.workspaceId,
        conversationId,
      },
    });

    await tx.conversation.deleteMany({
      where: {
        id: conversationId,
        workspaceId: ws.workspaceId,
        assignedToUserId: ws.userId,
      },
    });
  });

  return NextResponse.json({ ok: true });
}
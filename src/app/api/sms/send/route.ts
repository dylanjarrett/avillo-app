// src/app/api/sms/send/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendSms } from "@/lib/twilioClient";
import { requireWorkspace } from "@/lib/workspace";
import { requireEntitlement } from "@/lib/entitlements";
import { normalizeE164 } from "@/lib/phone/normalize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const ws = await requireWorkspace();
    if (!ws.ok) return NextResponse.json(ws.error, { status: ws.status });

    // ✅ Entitlement gate
    const gate = await requireEntitlement(ws.workspaceId, "COMMS_ACCESS");
    if (!gate.ok) return NextResponse.json(gate.error, { status: 402 });

    const { to, body, contactId, listingId, conversationId, phoneNumberId } = await req.json();

    const toE164 = normalizeE164(String(to ?? ""));
    const text = String(body ?? "");

    if (!toE164 || !text.trim()) {
      return NextResponse.json({ error: "Missing or invalid 'to' / 'body'." }, { status: 400 });
    }

    // ✅ If caller supplies conversationId, ensure it's theirs
    if (conversationId) {
      const conv = await prisma.conversation.findFirst({
        where: {
          id: String(conversationId),
          workspaceId: ws.workspaceId,
          assignedToUserId: ws.userId,
        },
        select: { id: true },
      });
      if (!conv) {
        return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
      }
    }

    // ✅ If caller supplies phoneNumberId, ensure it's theirs
    if (phoneNumberId) {
      const pn = await prisma.userPhoneNumber.findFirst({
        where: {
          id: String(phoneNumberId),
          workspaceId: ws.workspaceId,
          assignedToUserId: ws.userId,
          status: "ACTIVE",
        },
        select: { id: true },
      });
      if (!pn) {
        return NextResponse.json({ error: "Phone number not found." }, { status: 404 });
      }
    }

    const message = await sendSms({
      userId: ws.userId,
      workspaceId: ws.workspaceId,
      to: toE164,
      body: text,
      contactId: contactId ?? null,
      listingId: listingId ?? null,
      conversationId: conversationId ?? null,
      phoneNumberId: phoneNumberId ?? null,
      source: "MANUAL",
    });

    return NextResponse.json({ sid: message.sid, status: message.status });
  } catch (error: any) {
    console.error("[SMS] Error sending SMS:", error);
    return NextResponse.json({ error: error?.message ?? "Failed to send SMS." }, { status: 500 });
  }
}
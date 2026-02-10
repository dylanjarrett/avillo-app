// src/app/api/twilio/status/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeE164 } from "@/lib/phone/normalize";
import { requireEntitlement } from "@/lib/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const bodyText = await req.text();
  const params = new URLSearchParams(bodyText);

  const messageSid = params.get("MessageSid") || "";
  const messageStatus = params.get("MessageStatus") || params.get("SmsStatus") || "";
  const errorCode = params.get("ErrorCode");
  const errorMessage = params.get("ErrorMessage");

  const to = normalizeE164(params.get("To") || "");
  const from = normalizeE164(params.get("From") || "");

  if (!messageSid) return NextResponse.json({ ok: true });

  const sms = await prisma.smsMessage.findUnique({
    where: { twilioSid: messageSid },
    select: {
      id: true,
      workspaceId: true,
      assignedToUserId: true,
      phoneNumberId: true,
      conversationId: true,
      contactId: true,
      listingId: true,
    },
  });

  if (!sms) return NextResponse.json({ ok: true });

  // ✅ Entitlement gate: if comms disabled, ignore webhook updates (don’t write)
  const gate = await requireEntitlement(sms.workspaceId, "COMMS_ACCESS");
  if (!gate.ok) return NextResponse.json({ ok: true });

  const errorCombined =
    errorCode || errorMessage
      ? `${errorCode ?? ""}${errorCode ? ": " : ""}${errorMessage ?? ""}`.trim()
      : null;

  // Update message status/error
  await prisma.smsMessage.update({
    where: { id: sms.id },
    data: {
      status: messageStatus || undefined,
      error: errorCombined || undefined,
    },
  });

  // ✅ Dedupe: if last DELIVERY_UPDATE for this smsMessageId already had same status, skip
  const last = await prisma.commEvent.findFirst({
    where: { workspaceId: sms.workspaceId, type: "DELIVERY_UPDATE", smsMessageId: sms.id },
    orderBy: { occurredAt: "desc" },
    select: { payload: true },
  });

  const lastStatus = (last?.payload as any)?.messageStatus ?? null;
  if (lastStatus === messageStatus) return NextResponse.json({ ok: true });

  await prisma.commEvent.create({
    data: {
      workspaceId: sms.workspaceId,
      type: "DELIVERY_UPDATE",
      source: "SYSTEM",
      assignedToUserId: sms.assignedToUserId ?? null,
      phoneNumberId: sms.phoneNumberId ?? null,
      conversationId: sms.conversationId ?? null,
      contactId: sms.contactId ?? null,
      listingId: sms.listingId ?? null,
      smsMessageId: sms.id,
      occurredAt: new Date(),
      payload: {
        messageSid,
        messageStatus,
        to,
        from,
        errorCode,
        errorMessage,
      },
    },
  });

  return NextResponse.json({ ok: true });
}
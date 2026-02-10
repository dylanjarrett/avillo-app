// src/app/api/twilio/inbound/route.ts
import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";
import { prisma } from "@/lib/prisma";
import { normalizeE164, upperTrim } from "@/lib/phone/normalize";
import { threadKeyForSms } from "@/lib/phone/threadKey";
import { requireEntitlement } from "@/lib/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function buildTwiml(message: string) {
  const twiml = new twilio.twiml.MessagingResponse();
  twiml.message(message);
  return twiml.toString();
}

function twimlResponse(message: string) {
  const xml = buildTwiml(message);
  return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml" } });
}

function isStopWord(upper: string) {
  return ["STOP", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"].includes(upper);
}

export async function POST(req: NextRequest) {
  const bodyText = await req.text();
  const params = new URLSearchParams(bodyText);

  const from = normalizeE164(params.get("From") || "");
  const to = normalizeE164(params.get("To") || "");
  const msg = (params.get("Body") || "").trim();
  const upper = upperTrim(msg);

  const twilioSid =
    params.get("MessageSid") || params.get("SmsMessageSid") || params.get("SmsSid") || "";

  if (!from || !to) return twimlResponse("Invalid message.");

  // Route by To => UserPhoneNumber (workspace + assigned user)
  const phoneNumber = await prisma.userPhoneNumber.findFirst({
    where: { e164: to, status: "ACTIVE" },
    select: { id: true, workspaceId: true, assignedToUserId: true },
  });

  if (!phoneNumber) return twimlResponse("This number is not configured yet.");

  const workspaceId = phoneNumber.workspaceId;
  const assignedToUserId = phoneNumber.assignedToUserId;

  // ✅ Entitlement gate (webhook-safe): if comms disabled, do not write anything
  const gate = await requireEntitlement(workspaceId, "COMMS_ACCESS");
  if (!gate.ok) return twimlResponse("This number is inactive. Please contact your agent.");

  const contact = await prisma.contact.findFirst({
    where: { workspaceId, phone: from },
    select: { id: true },
  });

  const threadKey = threadKeyForSms({
    phoneNumberId: phoneNumber.id,
    contactId: contact?.id ?? null,
    otherPartyE164: from,
  });

  const conversation = await prisma.conversation.upsert({
    where: { workspaceId_threadKey: { workspaceId, threadKey } },
    create: {
      workspaceId,
      assignedToUserId,
      phoneNumberId: phoneNumber.id,
      contactId: contact?.id ?? null,
      threadKey,
      lastMessageAt: new Date(),
      lastInboundAt: new Date(),
    },
    update: {
      contactId: contact?.id ?? undefined,
      lastMessageAt: new Date(),
      lastInboundAt: new Date(),
    },
    select: { id: true },
  });

  // STOP / START / HELP
  if (isStopWord(upper)) {
    await prisma.smsSuppression.upsert({
      where: { workspaceId_phone: { workspaceId, phone: from } },
      update: { reason: "STOP" },
      create: { workspaceId, createdByUserId: assignedToUserId, phone: from, reason: "STOP" },
    });

    await prisma.contact.updateMany({
      where: { workspaceId, phone: from },
      data: { smsOptedOutAt: new Date() },
    });
  } else if (upper === "START" || upper === "YES") {
    await prisma.smsSuppression.deleteMany({ where: { workspaceId, phone: from } });

    await prisma.contact.updateMany({
      where: { workspaceId, phone: from },
      data: { smsOptedOutAt: null },
    });
  }

  // ✅ Idempotency: find existing SmsMessage by twilioSid first
  let smsMessageId: string | null = null;

  if (twilioSid) {
    const existing = await prisma.smsMessage.findUnique({
      where: { twilioSid },
      select: { id: true },
    });
    if (existing) smsMessageId = existing.id;
  }

  // Create inbound message if it doesn't exist
  if (!smsMessageId) {
    try {
      const created = await prisma.smsMessage.create({
        data: {
          workspaceId,
          source: "SYSTEM",
          phoneNumberId: phoneNumber.id,
          assignedToUserId,
          conversationId: conversation.id,
          contactId: contact?.id ?? null,
          direction: "INBOUND",
          fromNumber: from,
          toNumber: to,
          body: msg,
          twilioSid: twilioSid || null,
          status: "received",
        },
        select: { id: true },
      });
      smsMessageId = created.id;
    } catch {
      // if a race created it, re-fetch
      if (twilioSid) {
        const existing = await prisma.smsMessage.findUnique({
          where: { twilioSid },
          select: { id: true },
        });
        smsMessageId = existing?.id ?? null;
      }
    }
  }

  // ✅ Avoid duplicate CommEvent on retries
  if (smsMessageId) {
    const existingEvent = await prisma.commEvent.findFirst({
      where: { workspaceId, type: "SMS_IN", smsMessageId },
      select: { id: true },
    });

    if (!existingEvent) {
      await prisma.commEvent.create({
        data: {
          workspaceId,
          type: "SMS_IN",
          source: "SYSTEM",
          assignedToUserId,
          phoneNumberId: phoneNumber.id,
          conversationId: conversation.id,
          contactId: contact?.id ?? null,
          smsMessageId,
          occurredAt: new Date(),
          payload: { from, to, twilioSid: twilioSid || null },
        },
      });
    }
  }

  if (isStopWord(upper)) return twimlResponse("You’re unsubscribed. Reply START to re-subscribe.");
  if (upper === "START" || upper === "YES") return twimlResponse("You’re back in. Reply STOP to opt out, HELP for help.");
  if (upper === "HELP") return twimlResponse("Avillo: Reply STOP to opt out. Help: support@avillo.io");

  return twimlResponse("Got it. Reply STOP to opt out, HELP for help.");
}
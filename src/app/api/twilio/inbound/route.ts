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

function isStartWord(upper: string) {
  return upper === "START" || upper === "YES";
}

function isHelpWord(upper: string) {
  return upper === "HELP";
}

function normalizeForLookup(e164: string) {
  const v = normalizeE164(e164);
  if (!v) return { e164: "", alt: "" };
  // Allow matching legacy contacts that stored without +1
  const alt = v.startsWith("+1") ? v.replace(/^\+1/, "") : v;
  return { e164: v, alt };
}

export async function POST(req: NextRequest) {
  // Twilio posts form-encoded body
  const bodyText = await req.text();
  const params = new URLSearchParams(bodyText);

  const fromRaw = params.get("From") || "";
  const toRaw = params.get("To") || "";
  const msg = (params.get("Body") || "").trim();
  const upper = upperTrim(msg);

  const twilioSid = String(
    params.get("MessageSid") || params.get("SmsMessageSid") || params.get("SmsSid") || ""
  ).trim();

  const fromNorm = normalizeForLookup(fromRaw);
  const toNorm = normalizeForLookup(toRaw);

  const from = fromNorm.e164;
  const to = toNorm.e164;

  if (!from || !to) return twimlResponse("Invalid message.");

  // Route by To => UserPhoneNumber (workspace + assigned user)
  const phoneNumber = await prisma.userPhoneNumber.findFirst({
    where: { e164: to, status: "ACTIVE" },
    select: { id: true, workspaceId: true, assignedToUserId: true },
  });

  if (!phoneNumber) return twimlResponse("This number is not configured yet.");

  const workspaceId = phoneNumber.workspaceId;
  const assignedToUserId = phoneNumber.assignedToUserId;

  // Webhook-safe entitlement gate: if comms disabled, do not write anything
  const gate = await requireEntitlement(workspaceId, "COMMS_ACCESS");
  if (!gate.ok) return twimlResponse("This number is inactive. Please contact your agent.");

  const now = new Date();

  // Optional contact link (best-effort; supports non-normalized stored phones)
  const contact = await prisma.contact.findFirst({
    where: {
      workspaceId,
      OR: [{ phone: fromNorm.e164 }, { phone: fromNorm.alt }],
    },
    select: { id: true },
  });

  // Deterministic conversation identity
  const threadKey = threadKeyForSms({
    phoneNumberId: phoneNumber.id,
    otherPartyE164: from, // MUST be normalized E.164
  });

  // Upsert conversation and ALWAYS persist otherPartyE164
  const conversation = await prisma.conversation.upsert({
    where: { workspaceId_threadKey: { workspaceId, threadKey } },
    create: {
      workspaceId,
      assignedToUserId,
      phoneNumberId: phoneNumber.id,
      contactId: contact?.id ?? null,
      threadKey,
      otherPartyE164: from,
      lastMessageAt: now,
      lastInboundAt: now,
      updatedAt: now, 
    },
    update: {
      contactId: contact?.id ?? undefined,
      otherPartyE164: from,
      lastMessageAt: now,
      lastInboundAt: now,
      updatedAt: now, 
    },
    select: { id: true },
  });

  // ✅ SELF-HEAL: if earlier bugs created multiple convo rows, reattach any messages
  // for this same phoneNumberId + (from/to pair) onto the canonical conversation.
  // This is what prevents “only last message shows” after refresh.
  await prisma.smsMessage.updateMany({
    where: {
      workspaceId,
      phoneNumberId: phoneNumber.id,
      assignedToUserId, // keep user-private boundary tight
      conversationId: { not: conversation.id },
      OR: [
        { fromNumber: from, toNumber: to },
        { fromNumber: to, toNumber: from },
      ],
    },
    data: { conversationId: conversation.id },
  });

  // STOP / START / HELP (suppression is workspace-scoped)
  if (isStopWord(upper)) {
    await prisma.smsSuppression.upsert({
      where: { workspaceId_phone: { workspaceId, phone: from } },
      update: { reason: "STOP" },
      create: { workspaceId, createdByUserId: assignedToUserId, phone: from, reason: "STOP" },
    });

    await prisma.contact.updateMany({
      where: { workspaceId, OR: [{ phone: fromNorm.e164 }, { phone: fromNorm.alt }] },
      data: { smsOptedOutAt: now },
    });
  } else if (isStartWord(upper)) {
    await prisma.smsSuppression.deleteMany({ where: { workspaceId, phone: from } });

    await prisma.contact.updateMany({
      where: { workspaceId, OR: [{ phone: fromNorm.e164 }, { phone: fromNorm.alt }] },
      data: { smsOptedOutAt: null },
    });
  }

  // ✅ Idempotency: find existing SmsMessage by twilioSid first (if present)
  let smsMessageId: string | null = null;

  if (twilioSid) {
    const existing = await prisma.smsMessage.findUnique({
      where: { twilioSid },
      select: { id: true },
    });
    if (existing) smsMessageId = existing.id;
  }

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
          createdAt: now,
        },
        select: { id: true },
      });
      smsMessageId = created.id;
    } catch {
      // race-safe fallback for retries
      if (twilioSid) {
        const existing = await prisma.smsMessage.findUnique({
          where: { twilioSid },
          select: { id: true },
        });
        smsMessageId = existing?.id ?? null;
      }
    }
  }

  // Avoid duplicate CommEvent on retries
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
          occurredAt: now,
          payload: { from, to, twilioSid: twilioSid || null },
          createdAt: now,
        },
      });
    }
  }

  // TwiML responses
  if (isStopWord(upper)) return twimlResponse("You’re unsubscribed. Reply START to re-subscribe.");
  if (isStartWord(upper)) return twimlResponse("You’re back in. Reply STOP to opt out, HELP for help.");
  if (isHelpWord(upper)) return twimlResponse("Avillo: Reply STOP to opt out. Help: support@avillo.io");

  return twimlResponse("Got it. Reply STOP to opt out, HELP for help.");
}
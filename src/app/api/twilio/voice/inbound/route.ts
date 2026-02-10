// src/app/api/twilio/voice/inbound/route.ts
import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";
import { prisma } from "@/lib/prisma";
import { normalizeE164 } from "@/lib/phone/normalize";
import { threadKeyForSms } from "@/lib/phone/threadKey";
import { requireEntitlement } from "@/lib/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function voiceTwimlDial(toNumberE164: string) {
  const vr = new twilio.twiml.VoiceResponse();
  vr.dial({ timeout: 25 }, toNumberE164);
  return vr.toString();
}

function voiceTwimlSay(message: string) {
  const vr = new twilio.twiml.VoiceResponse();
  vr.say(message);
  return vr.toString();
}

export async function POST(req: NextRequest) {
  const bodyText = await req.text();
  const params = new URLSearchParams(bodyText);

  const from = normalizeE164(params.get("From") || "");
  const to = normalizeE164(params.get("To") || "");
  const callSid = (params.get("CallSid") || "").trim();

  if (!from || !to || !callSid) {
    return new NextResponse("OK", { status: 200 });
  }

  // Route by To (Avillo number)
  const pn = await prisma.userPhoneNumber.findFirst({
    where: { e164: to, status: "ACTIVE" },
    select: { id: true, workspaceId: true, assignedToUserId: true },
  });

  if (!pn) {
    const xml = voiceTwimlSay("This number is not configured yet.");
    return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml" } });
  }

  const workspaceId = pn.workspaceId;
  const assignedToUserId = pn.assignedToUserId;

  // Webhook-safe gate: don't write if disabled
  const gate = await requireEntitlement(workspaceId, "COMMS_ACCESS");
  if (!gate.ok) {
    const xml = voiceTwimlSay("This number is inactive.");
    return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml" } });
  }

  // Agent forwarding number (User.phone)
  const user = await prisma.user.findFirst({
    where: { id: assignedToUserId },
    select: { phone: true },
  });
  const agentPhone = normalizeE164(String(user?.phone ?? ""));
  if (!agentPhone) {
    const xml = voiceTwimlSay("The agent phone number is not configured.");
    return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml" } });
  }

  // Optional contact link (best-effort)
  const contact = await prisma.contact.findFirst({
    where: {
      workspaceId,
      OR: [{ phone: from }, { phone: from.replace(/^\+1/, "") }],
    },
    select: { id: true },
  });

  // Ensure conversation (deterministic threadKey)
  const threadKey = threadKeyForSms({
    phoneNumberId: pn.id,
    otherPartyE164: from,
  });

  const now = new Date();

  const conversation = await prisma.conversation.upsert({
    where: { workspaceId_threadKey: { workspaceId, threadKey } },
    create: {
      workspaceId,
      assignedToUserId,
      phoneNumberId: pn.id,
      contactId: contact?.id ?? null,
      threadKey,
      otherPartyE164: from,
      lastMessageAt: now,
    },
    update: {
      contactId: contact?.id ?? undefined,
      otherPartyE164: from,
      lastMessageAt: now,
    },
    select: { id: true },
  });

  // Idempotent call create by twilioCallSid (unique)
  let callId: string | null = null;
  try {
    const created = await prisma.call.create({
      data: {
        workspaceId,
        phoneNumberId: pn.id,
        assignedToUserId,
        source: "SYSTEM",
        conversationId: conversation.id,
        contactId: contact?.id ?? null,
        direction: "INBOUND",
        status: "RINGING",
        fromNumber: from,
        toNumber: to,
        twilioCallSid: callSid,
        createdAt: now,
      },
      select: { id: true },
    });
    callId = created.id;
  } catch {
    const existing = await prisma.call.findUnique({
      where: { twilioCallSid: callSid },
      select: { id: true },
    });
    callId = existing?.id ?? null;
  }

  // Create CALL_IN event (dedupe by callId)
  if (callId) {
    const existingEvent = await prisma.commEvent.findFirst({
      where: { workspaceId, type: "CALL_IN", callId },
      select: { id: true },
    });
    if (!existingEvent) {
      await prisma.commEvent.create({
        data: {
          workspaceId,
          type: "CALL_IN",
          source: "SYSTEM",
          assignedToUserId,
          phoneNumberId: pn.id,
          conversationId: conversation.id,
          contactId: contact?.id ?? null,
          callId,
          occurredAt: now,
          payload: { from, to, twilioCallSid: callSid },
          createdAt: now,
        },
      });
    }
  }

  const xml = voiceTwimlDial(agentPhone);
  return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml" } });
}
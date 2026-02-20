// src/app/api/comms/calls/start/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";
import { requireEntitlement } from "@/lib/entitlements";
import { twilioClient } from "@/lib/twilioClient";
import { normalizeE164, safeStr } from "@/lib/phone/normalize";
import { threadKeyForSms } from "@/lib/phone/threadKey";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function appBaseUrl() {
  return process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://app.avillo.io";
}

export async function POST(req: NextRequest) {
  const ws = await requireWorkspace();
  if (!ws.ok) return NextResponse.json(ws.error, { status: ws.status });

  const gate = await requireEntitlement(ws.workspaceId, "COMMS_ACCESS");
  if (!gate.ok) return NextResponse.json(gate.error, { status: 402 });

  const body = await req.json();
  const to = normalizeE164(String(body?.to ?? ""));
  const contactId = safeStr(body?.contactId);
  const listingId = safeStr(body?.listingId);
  const conversationId = safeStr(body?.conversationId);
  const phoneNumberIdOverride = safeStr(body?.phoneNumberId);

  if (!to) return NextResponse.json({ error: "Invalid 'to' phone number." }, { status: 400 });

  // If conversationId provided, ensure it belongs to user
  if (conversationId) {
    const conv = await prisma.conversation.findFirst({
      where: { id: conversationId, workspaceId: ws.workspaceId, assignedToUserId: ws.userId },
      select: { id: true },
    });
    if (!conv) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }

  // Resolve user's Avillo number
  const pn =
    (phoneNumberIdOverride
      ? await prisma.userPhoneNumber.findFirst({
          where: {
            id: phoneNumberIdOverride,
            workspaceId: ws.workspaceId,
            assignedToUserId: ws.userId,
            status: "ACTIVE",
          },
          select: { id: true, e164: true, assignedToUserId: true },
        })
      : null) ??
    (await prisma.userPhoneNumber.findFirst({
      where: { workspaceId: ws.workspaceId, assignedToUserId: ws.userId, status: "ACTIVE" },
      select: { id: true, e164: true, assignedToUserId: true },
    }));

  if (!pn) {
    return NextResponse.json(
      { error: "No active Avillo phone number assigned to you in this workspace." },
      { status: 400 }
    );
  }

  // Agent forwarding number (User.phone)
  const user = await prisma.user.findFirst({
    where: { id: ws.userId },
    select: { phone: true },
  });

  const agentPhone = normalizeE164(String(user?.phone ?? ""));
  if (!agentPhone) {
    return NextResponse.json(
      { error: "Your user profile is missing a valid phone number to route calls to." },
      { status: 400 }
    );
  }

  const now = new Date();

  // Ensure conversation (if not provided)
  let convId = conversationId;
  if (!convId) {
    const threadKey = threadKeyForSms({
      phoneNumberId: pn.id,
      otherPartyE164: to,
    });

    const conv = await prisma.conversation.upsert({
      where: { workspaceId_threadKey: { workspaceId: ws.workspaceId, threadKey } },
      create: {
        workspaceId: ws.workspaceId,
        assignedToUserId: ws.userId,
        phoneNumberId: pn.id,
        contactId: contactId ?? null,
        listingId: listingId ?? null,
        threadKey,
        otherPartyE164: to,
        lastMessageAt: now,
      },
      update: {
        contactId: contactId ?? undefined,
        listingId: listingId ?? undefined,
        otherPartyE164: to,
        lastMessageAt: now,
      },
      select: { id: true },
    });

    convId = conv.id;
  }

  /**
   * IMPORTANT:
   * Call.twilioCallSid is @unique.
   * Never use a static placeholder like "PENDING" or you'll crash on second call.
   *
   * We'll create the row with a guaranteed-unique placeholder, then update once Twilio returns the real SID.
   */
  const callId = crypto.randomUUID();
  const placeholderSid = `pending-${callId}`;

  const callRow = await prisma.call.create({
    data: {
      id: callId,
      workspaceId: ws.workspaceId,
      phoneNumberId: pn.id,
      assignedToUserId: ws.userId,
      source: "MANUAL",
      conversationId: convId,
      contactId: contactId ?? null,
      listingId: listingId ?? null,
      direction: "OUTBOUND",
      status: "QUEUED",
      fromNumber: pn.e164,
      toNumber: to,
      twilioCallSid: placeholderSid,
      createdAt: now,
    },
    select: { id: true },
  });

  // Twilio calls the agent; when answered, bridge route dials the lead
  const bridgeUrl = `${appBaseUrl()}/api/twilio/voice/bridge?callId=${encodeURIComponent(callRow.id)}`;

  const twilioCall = await twilioClient.calls.create({
    to: agentPhone,
    from: pn.e164,
    url: bridgeUrl,
    statusCallback: `${appBaseUrl()}/api/twilio/voice-status`,
    statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
    statusCallbackMethod: "POST",
  });

  // Update call with real Twilio SID
  await prisma.call.update({
    where: { id: callRow.id },
    data: {
      twilioCallSid: twilioCall.sid,
      status: "QUEUED",
      updatedAt: new Date(),
    },
  });

  // Comm event
  await prisma.commEvent.create({
    data: {
      workspaceId: ws.workspaceId,
      type: "CALL_OUT",
      source: "MANUAL",
      assignedToUserId: ws.userId,
      phoneNumberId: pn.id,
      conversationId: convId,
      contactId: contactId ?? null,
      listingId: listingId ?? null,
      callId: callRow.id,
      occurredAt: now,
      payload: { to, from: pn.e164, twilioCallSid: twilioCall.sid },
      createdAt: now,
    },
  });

  return NextResponse.json({
    callId: callRow.id,
    callSid: twilioCall.sid,
    status: twilioCall.status,
  });
}
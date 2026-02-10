// src/app/api/twilio/voice-status/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireEntitlement } from "@/lib/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mapTwilioCallStatus(input: string | null) {
  const s = String(input ?? "").toLowerCase();
  switch (s) {
    case "queued":
      return "QUEUED";
    case "ringing":
      return "RINGING";
    case "in-progress":
      return "IN_PROGRESS";
    case "completed":
      return "COMPLETED";
    case "busy":
      return "BUSY";
    case "failed":
      return "FAILED";
    case "no-answer":
      return "NO_ANSWER";
    case "canceled":
      return "CANCELED";
    default:
      return null;
  }
}

export async function POST(req: NextRequest) {
  const bodyText = await req.text();
  const params = new URLSearchParams(bodyText);

  const callSid = params.get("CallSid") || "";
  const callStatusRaw = params.get("CallStatus");
  const duration = params.get("CallDuration");
  const recordingUrl = params.get("RecordingUrl");
  const recordingSid = params.get("RecordingSid");

  if (!callSid) return NextResponse.json({ ok: true });

  const call = await prisma.call.findUnique({
    where: { twilioCallSid: callSid },
    select: {
      id: true,
      workspaceId: true,
      assignedToUserId: true,
      phoneNumberId: true,
      conversationId: true,
      contactId: true,
      listingId: true,
      startedAt: true,
    },
  });

  if (!call) return NextResponse.json({ ok: true });

  // ✅ Entitlement gate: if comms disabled, ignore webhook updates (don’t write)
  const gate = await requireEntitlement(call.workspaceId, "COMMS_ACCESS");
  if (!gate.ok) return NextResponse.json({ ok: true });

  const mapped = mapTwilioCallStatus(callStatusRaw);

  await prisma.call.update({
    where: { id: call.id },
    data: {
      status: mapped ?? undefined,
      durationSec: duration ? Number(duration) : undefined,
      recordingUrl: recordingUrl || undefined,
      recordingSid: recordingSid || undefined,
      startedAt: mapped === "IN_PROGRESS" ? (call.startedAt ?? new Date()) : undefined,
      endedAt:
        mapped === "COMPLETED" ||
        mapped === "FAILED" ||
        mapped === "NO_ANSWER" ||
        mapped === "BUSY" ||
        mapped === "CANCELED"
          ? new Date()
          : undefined,
    },
  });

  // Emit missed call event (deduped per callId)
  if (mapped === "NO_ANSWER" || mapped === "BUSY" || mapped === "FAILED") {
    const existing = await prisma.commEvent.findFirst({
      where: { workspaceId: call.workspaceId, type: "MISSED_CALL", callId: call.id },
      select: { id: true },
    });

    if (!existing) {
      await prisma.commEvent.create({
        data: {
          workspaceId: call.workspaceId,
          type: "MISSED_CALL",
          source: "SYSTEM",
          assignedToUserId: call.assignedToUserId,
          phoneNumberId: call.phoneNumberId,
          conversationId: call.conversationId ?? null,
          contactId: call.contactId ?? null,
          listingId: call.listingId ?? null,
          callId: call.id,
          occurredAt: new Date(),
          payload: { callSid, callStatus: callStatusRaw, duration },
        },
      });
    }
  }

  return NextResponse.json({ ok: true });
}
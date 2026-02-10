// src/app/api/twilio/voice/bridge/route.ts
import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";
import { prisma } from "@/lib/prisma";
import { requireEntitlement } from "@/lib/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Twilio hits this after calling the agent (outbound bridge).
 * We fetch the Call row and dial the lead using callerId=Avillo number.
 */
export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const callId = url.searchParams.get("callId") || "";

  if (!callId) return new NextResponse("OK", { status: 200 });

  const call = await prisma.call.findFirst({
    where: { id: callId },
    select: {
      id: true,
      workspaceId: true,
      phoneNumber: { select: { e164: true } },
      toNumber: true,
      fromNumber: true,
    },
  });

  const vr = new twilio.twiml.VoiceResponse();

  if (!call) {
    vr.say("Call not found.");
    return new NextResponse(vr.toString(), { status: 200, headers: { "Content-Type": "text/xml" } });
  }

  // ✅ Entitlement gate (webhook-safe)
  const gate = await requireEntitlement(call.workspaceId, "COMMS_ACCESS");
  if (!gate.ok) {
    vr.say("This number is inactive.");
    return new NextResponse(vr.toString(), { status: 200, headers: { "Content-Type": "text/xml" } });
  }

  // Mark in-progress start (best effort)
  await prisma.call.update({
    where: { id: call.id },
    data: {
      status: "IN_PROGRESS",
      startedAt: new Date(),
    },
  });

  // Bridge: dial the lead, showing the Avillo number as callerId
  vr.dial(
    {
      callerId: call.phoneNumber?.e164 || call.fromNumber,
      timeout: 25,
    },
    call.toNumber
  );

  return new NextResponse(vr.toString(), { status: 200, headers: { "Content-Type": "text/xml" } });
}
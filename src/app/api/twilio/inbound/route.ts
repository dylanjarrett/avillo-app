// src/app/api/twilio/inbound/route.ts
import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function normalizeE164(input: string) {
  const raw = (input || "").trim();
  if (raw.startsWith("+")) return raw;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return digits ? `+${digits}` : "";
}

function buildTwiml(message: string) {
  const twiml = new twilio.twiml.MessagingResponse();
  twiml.message(message);
  return twiml.toString();
}

export async function POST(req: NextRequest) {
  const bodyText = await req.text(); // Twilio posts form-encoded
  const params = new URLSearchParams(bodyText);

  const from = normalizeE164(params.get("From") || "");
  const to = normalizeE164(params.get("To") || "");
  const msg = (params.get("Body") || "").trim();
  const upper = msg.toUpperCase();

  /**
   * Workspace-first routing:
   * - We need a workspaceId to satisfy schema constraints.
   * - If you have multiple Twilio numbers per workspace later, map "to" => workspaceId.
   * - For now, we support a single default workspace.
   */
  const workspaceId = process.env.SMS_DEFAULT_WORKSPACE_ID || "";
  const createdByUserId = process.env.SMS_DEFAULT_USER_ID || null; // optional audit actor

  if (!workspaceId) {
    const xml = buildTwiml("Thanks! SMS webhook not configured yet.");
    return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml" } });
  }

  // Find a contact in this workspace by phone (optional; helps link inbound to a person)
  const contact = await prisma.contact.findFirst({
    where: { workspaceId, phone: from },
    select: { id: true },
  });

  // Log inbound SMS (workspace-scoped)
  await prisma.smsMessage.create({
    data: {
      workspaceId,
      createdByUserId, // nullable is fine
      contactId: contact?.id ?? null,
      direction: "INBOUND",
      fromNumber: from,
      toNumber: to,
      body: msg,
      status: "received",
    },
  });

  const isStop =
    upper === "STOP" ||
    upper === "UNSUBSCRIBE" ||
    upper === "CANCEL" ||
    upper === "END" ||
    upper === "QUIT";

  if (isStop) {
    await prisma.smsSuppression.upsert({
      where: { workspaceId_phone: { workspaceId, phone: from } },
      update: { reason: "STOP" },
      create: {
        workspaceId,
        createdByUserId,
        phone: from,
        reason: "STOP",
      },
    });

    await prisma.contact.updateMany({
      where: { workspaceId, phone: from },
      data: { smsOptedOutAt: new Date() },
    });

    const xml = buildTwiml("You’re unsubscribed. Reply START to re-subscribe.");
    return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml" } });
  }

  if (upper === "START" || upper === "YES") {
    await prisma.smsSuppression.deleteMany({
      where: { workspaceId, phone: from },
    });

    await prisma.contact.updateMany({
      where: { workspaceId, phone: from },
      data: { smsOptedOutAt: null },
    });

    const xml = buildTwiml("You’re back in. Reply STOP to opt out, HELP for help.");
    return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml" } });
  }

  if (upper === "HELP") {
    const xml = buildTwiml("Avillo: Reply STOP to opt out. Help: support@avillo.io");
    return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml" } });
  }

  const xml = buildTwiml("Got it. Reply STOP to opt out, HELP for help.");
  return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml" } });
}

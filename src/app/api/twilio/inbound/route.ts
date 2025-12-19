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

  // Single-tenant shortcut for now:
  const userId = process.env.SMS_DEFAULT_USER_ID;

  if (!userId) {
    const xml = buildTwiml("Thanks! SMS webhook not configured yet.");
    return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml" } });
  }

  // Log inbound
  await prisma.smsMessage.create({
    data: {
      userId,
      direction: "INBOUND",
      fromNumber: from,
      toNumber: to,
      body: msg,
      status: "received",
    },
  });

  const isStop =
    upper === "STOP" || upper === "UNSUBSCRIBE" || upper === "CANCEL" || upper === "END" || upper === "QUIT";

  if (isStop) {
    await prisma.smsSuppression.upsert({
      where: { userId_phone: { userId, phone: from } },
      update: { reason: "STOP" },
      create: { userId, phone: from, reason: "STOP" },
    });

    await prisma.contact.updateMany({
      where: { userId, phone: from },
      data: { smsOptedOutAt: new Date() },
    });

    const xml = buildTwiml("You’re unsubscribed. Reply START to re-subscribe.");
    return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml" } });
  }

  if (upper === "START" || upper === "YES") {
    await prisma.smsSuppression.deleteMany({ where: { userId, phone: from } });

    await prisma.contact.updateMany({
      where: { userId, phone: from },
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

// src/app/api/twilio/number/provision/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";
import { requireEntitlement } from "@/lib/entitlements";
import { getTwilioClient } from "@/lib/twilioClient";
import { normalizeE164 } from "@/lib/phone/normalize";
import { PhoneCapability, PhoneNumberProvider, PhoneNumberStatus } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function appBaseUrl() {
  // ✅ In prod you should set APP_URL=https://app.avillo.io
  // In dev, use a public tunnel (ngrok/cloudflared) because Twilio rejects localhost.
  return process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://app.avillo.io";
}

function assertPublicBaseUrl(base: string) {
  const b = String(base || "").trim();
  if (!b) throw new Error("APP_URL is not set.");
  if (b.includes("localhost") || b.includes("127.0.0.1")) {
    throw new Error(
      "APP_URL must be a public URL (Twilio cannot call localhost). Use ngrok/cloudflared in dev."
    );
  }
  if (!/^https?:\/\//i.test(b)) {
    throw new Error("APP_URL must include http(s)://");
  }
}

export async function POST(req: NextRequest) {
  try {
    const { workspaceId, userId } = await requireWorkspace();

    // ✅ throws if not entitled (BETA bypass handled inside helper)
    await requireEntitlement(workspaceId, "COMMS_PROVISION_NUMBER");

    // Idempotency: if user already has an ACTIVE number, return it
    const existing = await prisma.userPhoneNumber.findFirst({
      where: {
        workspaceId,
        assignedToUserId: userId,
        status: PhoneNumberStatus.ACTIVE,
      },
      select: { id: true, e164: true, status: true },
      orderBy: { createdAt: "desc" },
    });

    if (existing) {
      return NextResponse.json({ ok: true, phoneNumber: existing });
    }

    let body: any = {};
    try {
      body = await req.json().catch(() => ({}));
    } catch {
      body = {};
    }

    const areaCodeRaw = String(body?.areaCode ?? "").replace(/[^\d]/g, "").trim();
    const areaCode = areaCodeRaw.length === 3 ? areaCodeRaw : null;

    const base = appBaseUrl();
    assertPublicBaseUrl(base);

    const client = getTwilioClient();

    // 1) Find an available US local number (optionally by area code)
    const localNumbers = (client.availablePhoneNumbers("US") as any).local;

    const available = await localNumbers.list({
      ...(areaCode ? { areaCode } : {}),
      smsEnabled: true,
      voiceEnabled: true,
      limit: 1,
    });

    const choice = available?.[0];
    const e164 = normalizeE164(String(choice?.phoneNumber ?? ""));
    if (!e164) {
      return NextResponse.json(
        { ok: false, error: { message: "No available phone numbers found. Try again shortly." } },
        { status: 409 }
      );
    }

    // 2) Purchase + configure webhooks (must be public URLs)
    const purchased = await client.incomingPhoneNumbers.create({
      phoneNumber: e164,
      smsUrl: `${base}/api/twilio/inbound`,
      smsMethod: "POST",
      voiceUrl: `${base}/api/twilio/voice/inbound`,
      voiceMethod: "POST",
    });

    // 3) Persist to DB (aligns with your Prisma fields)
    try {
      const created = await prisma.userPhoneNumber.create({
        data: {
          workspaceId,
          assignedToUserId: userId,
          provider: PhoneNumberProvider.TWILIO,
          status: PhoneNumberStatus.ACTIVE,
          e164,
          twilioIncomingPhoneNumberSid: purchased.sid,
          capabilities: [PhoneCapability.SMS, PhoneCapability.VOICE],
        },
        select: { id: true, e164: true, status: true },
      });

      return NextResponse.json({
        ok: true,
        phoneNumber: created,
        twilio: { sid: purchased.sid },
      });
    } catch (e: any) {
      // If the number was inserted concurrently (unique e164), return the existing row
      if (e?.code === "P2002") {
        const row = await prisma.userPhoneNumber.findUnique({
          where: { e164 },
          select: { id: true, e164: true, status: true },
        });
        if (row) {
          return NextResponse.json({ ok: true, phoneNumber: row, twilio: { sid: purchased.sid } });
        }
      }
      throw e;
    }
  } catch (err: any) {
    const message =
      err?.message || err?.error?.message || "Failed to provision your phone number.";

    const status = Number(err?.statusCode || err?.status || 500);

    return NextResponse.json({ ok: false, error: { message } }, { status });
  }
}
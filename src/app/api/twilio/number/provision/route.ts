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

function parseAreaCode(input: any): string | null {
  const raw = String(input ?? "").replace(/[^\d]/g, "").trim();
  if (!raw) return null;
  if (raw.length === 3) return raw;
  // If user pasted "503-..." or "1503...", try to grab last 3 digits.
  const last3 = raw.slice(-3);
  return last3.length === 3 ? last3 : null;
}

function safeErrorMessage(err: any, fallback: string) {
  const msg = String(err?.error?.message ?? err?.message ?? "").trim();
  return msg || fallback;
}

function safeStatusCode(err: any, fallback = 500) {
  const n = Number(err?.status ?? err?.statusCode ?? err?.code ?? NaN);
  if (Number.isFinite(n) && n >= 400 && n <= 599) return n;
  return fallback;
}

async function releaseTwilioNumberBestEffort(sid: string) {
  try {
    const client = getTwilioClient();
    await client.incomingPhoneNumbers(sid).remove();
  } catch {
    // best-effort cleanup only
  }
}

export async function POST(req: NextRequest) {
  let purchasedSid: string | null = null;

  try {
    // -------------------------
    // Auth + workspace
    // -------------------------
    const ctx = await requireWorkspace();
    if (!ctx.ok) return NextResponse.json(ctx.error, { status: ctx.status });

    const { workspaceId, userId } = ctx;

    // -------------------------
    // Entitlement gate (costly)
    // -------------------------
    const gate = await requireEntitlement(workspaceId, "COMMS_PROVISION_NUMBER");
    if (!gate.ok) {
      return NextResponse.json({ ok: false, error: gate.error }, { status: 403 });
    }

    // -------------------------
    // Base URL must be public
    // -------------------------
    const base = appBaseUrl();
    assertPublicBaseUrl(base);

    // -------------------------
    // Idempotency: if user already has active number, return it
    // -------------------------
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

    // -------------------------
    // Parse request
    // -------------------------
    const body = (await req.json().catch(() => ({}))) as any;
    const areaCode = parseAreaCode(body?.areaCode);

    // -------------------------
    // Twilio: find available number
    // -------------------------
    const client = getTwilioClient();

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

    // -------------------------
    // Concurrency guard: in case another request provisioned in the meantime
    // -------------------------
    const existingAfterLookup = await prisma.userPhoneNumber.findFirst({
      where: {
        workspaceId,
        assignedToUserId: userId,
        status: PhoneNumberStatus.ACTIVE,
      },
      select: { id: true, e164: true, status: true },
      orderBy: { createdAt: "desc" },
    });

    if (existingAfterLookup) {
      return NextResponse.json({ ok: true, phoneNumber: existingAfterLookup });
    }

    // -------------------------
    // Twilio: purchase + set webhooks
    // -------------------------
    const purchased = await client.incomingPhoneNumbers.create({
      phoneNumber: e164,
      smsUrl: `${base}/api/twilio/inbound`,
      smsMethod: "POST",
      voiceUrl: `${base}/api/twilio/voice/inbound`,
      voiceMethod: "POST",
    });

    purchasedSid = purchased.sid;

    // -------------------------
    // Persist to DB
    // -------------------------
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
      // If e164 unique collides (race or reused number), try to return that row.
      if (e?.code === "P2002") {
        const row = await prisma.userPhoneNumber.findUnique({
          where: { e164 },
          select: { id: true, e164: true, status: true },
        });

        if (row) {
          return NextResponse.json({
            ok: true,
            phoneNumber: row,
            twilio: { sid: purchased.sid },
          });
        }
      }

      // Anything else: release the Twilio number to avoid billing leaks.
      if (purchasedSid) {
        await releaseTwilioNumberBestEffort(purchasedSid);
        purchasedSid = null;
      }

      throw e;
    }
  } catch (err: any) {
    // Best-effort cleanup if we purchased but failed later.
    if (purchasedSid) {
      await releaseTwilioNumberBestEffort(purchasedSid);
      purchasedSid = null;
    }

    const message = safeErrorMessage(err, "Failed to provision your phone number.");
    const status = safeStatusCode(err, 500);

    return NextResponse.json({ ok: false, error: { message } }, { status });
  }
}
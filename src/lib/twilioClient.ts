// src/lib/twilioClient.ts
import twilio, { Twilio } from "twilio";
import { prisma } from "@/lib/prisma";
import { normalizeE164, safeStr } from "@/lib/phone/normalize";
import { threadKeyForSms } from "@/lib/phone/threadKey";
import { requireEntitlement } from "@/lib/entitlements";

const accountSid = process.env.TWILIO_ACCOUNT_SID || "";
const apiKeySid = process.env.TWILIO_API_KEY_SID || "";
const apiKeySecret = process.env.TWILIO_API_KEY_SECRET || "";

/**
 * Important: avoid crashing at import-time if env vars are missing.
 * We create the client lazily and throw a clear error only when actually used.
 */
let _client: Twilio | null = null;

export function getTwilioClient() {
  if (_client) return _client;

  if (!accountSid || !apiKeySid || !apiKeySecret) {
    throw new Error(
      "[Twilio] Missing env vars. Set TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET."
    );
  }

  _client = twilio(apiKeySid, apiKeySecret, { accountSid });
  return _client;
}

// Backwards-compatible export (if other files import twilioClient directly)
export const twilioClient = {
  get calls() {
    return getTwilioClient().calls;
  },
  get messages() {
    return getTwilioClient().messages;
  },
} as unknown as Twilio;

export async function sendSms(opts: {
  userId: string; // actor + owner agent
  workspaceId: string;
  to: string;
  body: string;

  contactId?: string | null;
  listingId?: string | null;
  conversationId?: string | null;

  // optional override if UI picked a specific number
  phoneNumberId?: string | null;

  source?: "MANUAL" | "AUTOMATION" | "ZORA" | "SYSTEM";
  automationRunId?: string | null;
}) {
  const userId = safeStr(opts.userId);
  const workspaceId = safeStr(opts.workspaceId);
  const contactId = safeStr(opts.contactId);
  const listingId = safeStr(opts.listingId);
  const conversationId = safeStr(opts.conversationId);
  const phoneNumberIdOverride = safeStr(opts.phoneNumberId);

  const body = String(opts.body ?? "");
  const toE164 = normalizeE164(String(opts.to ?? ""));

  if (!userId) throw new Error("sendSms missing userId");
  if (!workspaceId) throw new Error("sendSms missing workspaceId");
  if (!toE164) throw new Error("Invalid 'to' phone number");
  if (!body.trim()) throw new Error("Message body is empty");

  // ✅ Defense-in-depth: entitlement gate (routes also gate)
  const gate = await requireEntitlement(workspaceId, "COMMS_ACCESS");
  if (!gate.ok) throw new Error(gate.error.message || "Comms is not enabled for this workspace.");

  // ✅ Resolve sender number from DB (user-owned)
  const pn =
    (phoneNumberIdOverride
      ? await prisma.userPhoneNumber.findFirst({
          where: {
            id: phoneNumberIdOverride,
            workspaceId,
            assignedToUserId: userId,
            status: "ACTIVE",
          },
          select: { id: true, e164: true, assignedToUserId: true },
        })
      : null) ??
    (await prisma.userPhoneNumber.findFirst({
      where: { workspaceId, assignedToUserId: userId, status: "ACTIVE" },
      select: { id: true, e164: true, assignedToUserId: true },
    }));

  if (!pn) {
    throw new Error("No active Avillo phone number assigned to this user in this workspace.");
  }

  // Optional: validate contact belongs to workspace + respect contact opt-out
  if (contactId) {
    const c = await prisma.contact.findFirst({
      where: { id: contactId, workspaceId },
      select: { id: true, smsOptedOutAt: true },
    });
    if (!c) throw new Error("Contact not found in workspace.");
    if (c.smsOptedOutAt) throw new Error("Contact has opted out of SMS.");
  }

  // Workspace suppression (STOP)
  const suppressed = await prisma.smsSuppression.findUnique({
    where: { workspaceId_phone: { workspaceId, phone: toE164 } },
    select: { id: true, reason: true },
  });
  if (suppressed) throw new Error("Recipient has opted out of SMS.");

  // Ensure Conversation (unless caller passed one)
  let convId = conversationId;
  if (!convId) {
    const threadKey = threadKeyForSms({
      phoneNumberId: pn.id,
      contactId: contactId ?? null,
      otherPartyE164: toE164,
    });

    const conv = await prisma.conversation.upsert({
      where: { workspaceId_threadKey: { workspaceId, threadKey } },
      create: {
        workspaceId,
        assignedToUserId: pn.assignedToUserId,
        phoneNumberId: pn.id,
        contactId: contactId ?? null,
        listingId: listingId ?? null,
        threadKey,
        lastMessageAt: new Date(),
        lastOutboundAt: new Date(),
      },
      update: {
        contactId: contactId ?? undefined,
        listingId: listingId ?? undefined,
        lastMessageAt: new Date(),
        lastOutboundAt: new Date(),
      },
      select: { id: true },
    });
    convId = conv.id;
  }

  // Send via Twilio
  const message = await getTwilioClient().messages.create({
    from: pn.e164,
    to: toE164,
    body,
  });

  // Log SmsMessage
  const sms = await prisma.smsMessage.create({
    data: {
      workspaceId,
      createdByUserId: userId,
      source: opts.source ?? "MANUAL",
      phoneNumberId: pn.id,
      assignedToUserId: pn.assignedToUserId,
      conversationId: convId,
      contactId: contactId ?? null,
      listingId: listingId ?? null,
      direction: "OUTBOUND",
      fromNumber: pn.e164,
      toNumber: toE164,
      body,
      twilioSid: message.sid,
      status: message.status,
      automationRunId: opts.automationRunId ?? null,
    },
    select: { id: true },
  });

  // CommEvent
  await prisma.commEvent.create({
    data: {
      workspaceId,
      type: "SMS_OUT",
      source: opts.source ?? "MANUAL",
      assignedToUserId: pn.assignedToUserId,
      phoneNumberId: pn.id,
      conversationId: convId,
      contactId: contactId ?? null,
      listingId: listingId ?? null,
      smsMessageId: sms.id,
      automationRunId: opts.automationRunId ?? null,
      occurredAt: new Date(),
      payload: { twilioSid: message.sid, status: message.status },
    },
  });

  return message;
}
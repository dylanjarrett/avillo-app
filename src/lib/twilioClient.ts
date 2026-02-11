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
 * Avoid crashing at import-time if env vars are missing.
 * Create client lazily and throw only when actually used.
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

/**
 * Normalizes an E.164 for “pair” matching:
 * - Always normalize to E.164
 * - Also produce a legacy alt without +1 for old stored contact phones
 */
function normalizeForLookup(input: string) {
  const e164 = normalizeE164(String(input ?? ""));
  const alt = e164 && e164.startsWith("+1") ? e164.replace(/^\+1/, "") : e164;
  return { e164, alt };
}

/**
 * Ensures we never allow cross-thread contamination:
 * a conversation is uniquely defined by:
 * - workspaceId
 * - phoneNumberId (the Avillo number)
 * - otherPartyE164 (the lead/client number)
 *
 * If a conversationId is supplied, it must belong to the user AND
 * must match (phoneNumberId + otherPartyE164).
 */
async function assertConversationOwnershipAndConsistency(input: {
  workspaceId: string;
  userId: string;
  conversationId: string;
  phoneNumberId: string;
  otherPartyE164: string;
}) {
  const { workspaceId, userId, conversationId, phoneNumberId, otherPartyE164 } = input;

  const conv = await prisma.conversation.findFirst({
    where: {
      id: conversationId,
      workspaceId,
      assignedToUserId: userId,
    },
    select: {
      id: true,
      phoneNumberId: true,
      otherPartyE164: true,
      threadKey: true,
    },
  });

  if (!conv) throw new Error("Conversation not found.");

  if (conv.phoneNumberId !== phoneNumberId) {
    throw new Error("Conversation does not belong to your active phone number.");
  }

  // If otherPartyE164 missing or wrong, fix it (self-heal) — but never allow mismatch to persist
  if (!conv.otherPartyE164 || conv.otherPartyE164 !== otherPartyE164) {
    await prisma.conversation.update({
      where: { id: conv.id },
      data: { otherPartyE164: otherPartyE164 },
    });
  }

  return conv.id;
}

/**
 * Hardens the “single canonical conversation” invariant by:
 * - upserting by (workspaceId, threadKey)
 * - ensuring otherPartyE164 is set
 * - reattaching any orphan messages for the same phone-pair to the canonical convo
 */
async function ensureCanonicalConversationAndHeal(input: {
  workspaceId: string;
  assignedToUserId: string;
  phoneNumberId: string;
  otherPartyE164: string;
  contactId?: string | null;
  listingId?: string | null;
  now: Date;
  touch: "inbound" | "outbound";
}) {
  const {
    workspaceId,
    assignedToUserId,
    phoneNumberId,
    otherPartyE164,
    contactId,
    listingId,
    now,
    touch,
  } = input;

  const threadKey = threadKeyForSms({
    phoneNumberId,
    otherPartyE164, // MUST be normalized E.164
  });

  const conv = await prisma.conversation.upsert({
    where: { workspaceId_threadKey: { workspaceId, threadKey } },
    create: {
      workspaceId,
      assignedToUserId,
      phoneNumberId,
      contactId: contactId ?? null,
      listingId: listingId ?? null,
      threadKey,
      otherPartyE164,
      lastMessageAt: now,
      ...(touch === "outbound" ? { lastOutboundAt: now } : { lastInboundAt: now }),
    },
    update: {
      contactId: contactId ?? undefined,
      listingId: listingId ?? undefined,
      otherPartyE164,
      lastMessageAt: now,
      ...(touch === "outbound" ? { lastOutboundAt: now } : { lastInboundAt: now }),
    },
    select: { id: true },
  });

  const convId = conv.id;

  // ✅ SELF-HEAL: reattach any messages for this (phoneNumberId + otherPartyE164 pair)
  // that may have been written under a different conversationId due to earlier bugs.
  // We match BOTH directions to catch inbound/outbound rows.
  //
  // outbound: from=pn.e164, to=otherPartyE164
  // inbound:  from=otherPartyE164, to=pn.e164
  const pn = await prisma.userPhoneNumber.findFirst({
    where: { id: phoneNumberId, workspaceId },
    select: { e164: true },
  });

  const pnE164 = pn?.e164 ? normalizeE164(pn.e164) : null;

  if (pnE164) {
    await prisma.smsMessage.updateMany({
      where: {
        workspaceId,
        phoneNumberId,
        assignedToUserId,
        conversationId: { not: convId },
        OR: [
          { fromNumber: pnE164, toNumber: otherPartyE164 },
          { fromNumber: otherPartyE164, toNumber: pnE164 },
        ],
      },
      data: { conversationId: convId },
    });
  }

  return convId;
}

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
  const toNorm = normalizeForLookup(opts.to);
  const toE164 = toNorm.e164;

  if (!userId) throw new Error("sendSms missing userId");
  if (!workspaceId) throw new Error("sendSms missing workspaceId");
  if (!toE164) throw new Error("Invalid 'to' phone number");
  if (!body.trim()) throw new Error("Message body is empty");

  // Defense-in-depth: entitlement gate (routes also gate)
  const gate = await requireEntitlement(workspaceId, "COMMS_ACCESS");
  if (!gate.ok) throw new Error(gate.error?.message || "Comms is not enabled for this workspace.");

  // Resolve sender number (user-owned, workspace-scoped)
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

  if (!pn?.id || !pn.e164) {
    throw new Error("No active Avillo phone number assigned to this user in this workspace.");
  }

  const fromE164 = normalizeE164(pn.e164);
  if (!fromE164) throw new Error("Your Avillo number is invalid. Please re-provision.");

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
    select: { id: true },
  });
  if (suppressed) throw new Error("Recipient has opted out of SMS.");

  const now = new Date();

  // 1) Determine canonical conversation id
  let convId: string;

  if (conversationId) {
    // If provided, enforce it is owned + consistent with this number pair
    convId = await assertConversationOwnershipAndConsistency({
      workspaceId,
      userId,
      conversationId,
      phoneNumberId: pn.id,
      otherPartyE164: toE164,
    });

    // Still heal any orphan messages to this conversation (pair match)
    await prisma.smsMessage.updateMany({
      where: {
        workspaceId,
        phoneNumberId: pn.id,
        assignedToUserId: pn.assignedToUserId,
        conversationId: { not: convId },
        OR: [
          { fromNumber: fromE164, toNumber: toE164 },
          { fromNumber: toE164, toNumber: fromE164 },
        ],
      },
      data: { conversationId: convId },
    });

    // Touch conversation times to keep list ordering correct
    await prisma.conversation.update({
      where: { id: convId },
      data: { lastMessageAt: now, lastOutboundAt: now, otherPartyE164: toE164 },
    });
  } else {
    // No conversationId supplied — create or find canonical by threadKey
    convId = await ensureCanonicalConversationAndHeal({
      workspaceId,
      assignedToUserId: pn.assignedToUserId,
      phoneNumberId: pn.id,
      otherPartyE164: toE164,
      contactId: contactId ?? null,
      listingId: listingId ?? null,
      now,
      touch: "outbound",
    });
  }

  // 2) Send via Twilio
  const message = await getTwilioClient().messages.create({
    from: fromE164,
    to: toE164,
    body,
  });

  // 3) Log SmsMessage (OUTBOUND)
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
      fromNumber: fromE164,
      toNumber: toE164,
      body,
      twilioSid: message.sid,
      status: message.status,
      automationRunId: opts.automationRunId ?? null,
      createdAt: now,
    },
    select: { id: true },
  });

  // 4) CommEvent
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
      occurredAt: now,
      payload: { twilioSid: message.sid, status: message.status },
      createdAt: now,
    },
  });

  return message;
}
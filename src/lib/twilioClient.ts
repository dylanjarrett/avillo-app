import twilio from "twilio";
import { prisma } from "@/lib/prisma";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const apiKeySid = process.env.TWILIO_API_KEY_SID;
const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;
const fromNumber = process.env.TWILIO_PHONE_NUMBER;

if (!accountSid || !apiKeySid || !apiKeySecret || !fromNumber) {
  console.warn(
    "[Twilio] Missing environment variables. " +
      "Check TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID, " +
      "TWILIO_API_KEY_SECRET, TWILIO_PHONE_NUMBER."
  );
}

export const twilioClient = twilio(apiKeySid!, apiKeySecret!, {
  accountSid: accountSid!,
});

function normalizeE164(input: string) {
  const raw = (input || "").trim();
  if (raw.startsWith("+")) return raw;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return digits ? `+${digits}` : "";
}

function safeId(v: any): string | null {
  const s = String(v ?? "").trim();
  return s.length ? s : null;
}

export async function sendSms(opts: {
  userId: string; // for audit (createdByUserId)
  workspaceId: string; // REQUIRED now
  to: string;
  body: string;
  contactId?: string | null;
  source?: string;
}) {
  const userId = safeId(opts.userId);
  const workspaceId = safeId(opts.workspaceId);
  const contactId = safeId(opts.contactId);
  const body = String(opts.body ?? "");
  const toE164 = normalizeE164(String(opts.to ?? ""));

  if (!userId) throw new Error("sendSms missing userId");
  if (!workspaceId) throw new Error("sendSms missing workspaceId");
  if (!fromNumber) throw new Error("TWILIO_PHONE_NUMBER is not set");
  if (!toE164) throw new Error("Invalid 'to' phone number");

  // Optional: validate contact belongs to workspace (prevents cross-tenant logging)
  if (contactId) {
    const c = await prisma.contact.findFirst({
      where: { id: contactId, workspaceId },
      select: { id: true, smsOptedOutAt: true },
    });

    if (!c) throw new Error("Contact not found in workspace.");

    // Contact-level opt-out
    if (c.smsOptedOutAt) {
      await prisma.smsMessage.create({
        data: {
          workspaceId,
          createdByUserId: userId,
          contactId,
          direction: "OUTBOUND",
          fromNumber,
          toNumber: toE164,
          body,
          status: "blocked",
          error: "Contact smsOptedOutAt is set.",
        },
      });
      throw new Error("Contact has opted out of SMS.");
    }
  }

  // 1) Workspace-scoped suppression block (STOP)
  const suppressed = await prisma.smsSuppression.findUnique({
    where: {
      workspaceId_phone: {
        workspaceId,
        phone: toE164,
      },
    },
    select: { id: true, reason: true },
  });

  if (suppressed) {
    await prisma.smsMessage.create({
      data: {
        workspaceId,
        createdByUserId: userId,
        contactId: contactId ?? null,
        direction: "OUTBOUND",
        fromNumber,
        toNumber: toE164,
        body,
        status: "blocked",
        error: `Recipient is opted out (suppressed: ${suppressed.reason ?? "STOP"}).`,
      },
    });
    throw new Error("Recipient has opted out of SMS.");
  }

  // 2) Send through Twilio
  const message = await twilioClient.messages.create({
    from: fromNumber,
    to: toE164,
    body,
  });

  // 3) Log outbound (workspace-scoped)
  await prisma.smsMessage.create({
    data: {
      workspaceId,
      createdByUserId: userId,
      contactId: contactId ?? null,
      direction: "OUTBOUND",
      fromNumber,
      toNumber: toE164,
      body,
      twilioSid: message.sid,
      status: message.status,
    },
  });

  return message;
}
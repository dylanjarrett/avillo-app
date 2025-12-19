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

export async function sendSms(opts: {
  userId: string;
  to: string;
  body: string;
  contactId?: string | null;
  source?: string;
}) {
  const { userId, to, body, contactId } = opts;

  if (!fromNumber) throw new Error("TWILIO_PHONE_NUMBER is not set");

  const toE164 = normalizeE164(to);

  // 1) Block suppressed numbers (STOP)
  const suppressed = await prisma.smsSuppression.findUnique({
    where: { userId_phone: { userId, phone: toE164 } },
    select: { id: true },
  });

  if (suppressed) {
    await prisma.smsMessage.create({
      data: {
        userId,
        contactId: contactId || null,
        direction: "OUTBOUND",
        fromNumber,
        toNumber: toE164,
        body,
        status: "blocked",
        error: "Recipient is opted out (suppressed).",
      },
    });
    throw new Error("Recipient has opted out of SMS.");
  }

  // 2) If a contact is provided, also block if contact is opted out
  if (contactId) {
    const c = await prisma.contact.findUnique({
      where: { id: contactId },
      select: { smsOptedOutAt: true },
    });

    if (c?.smsOptedOutAt) {
      await prisma.smsMessage.create({
        data: {
          userId,
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

  // 3) Send through Twilio
  const message = await twilioClient.messages.create({
    from: fromNumber,
    to: toE164,
    body,
  });

  // 4) Log outbound
  await prisma.smsMessage.create({
    data: {
      userId,
      contactId: contactId || null,
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
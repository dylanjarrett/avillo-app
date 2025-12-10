// src/lib/twilioClient.ts
import twilio from "twilio";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const apiKeySid = process.env.TWILIO_API_KEY_SID;
const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;
const fromNumber = process.env.TWILIO_PHONE_NUMBER;

if (!accountSid || !apiKeySid || !apiKeySecret || !fromNumber) {
  // This will show up in your server logs if something is missing
  console.warn(
    "[Twilio] Missing environment variables. " +
      "Check TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID, " +
      "TWILIO_API_KEY_SECRET, TWILIO_PHONE_NUMBER."
  );
}

export const twilioClient = twilio(apiKeySid!, apiKeySecret!, {
  accountSid: accountSid!,
});

export async function sendSms(to: string, body: string) {
  if (!fromNumber) {
    throw new Error("TWILIO_PHONE_NUMBER is not set");
  }

  const message = await twilioClient.messages.create({
    from: fromNumber,
    to,
    body,
  });

  return message;
}
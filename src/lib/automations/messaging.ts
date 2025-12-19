// src/lib/automations/messaging.ts

import { sendSms } from "@/lib/twilioClient";
import { sendEmail } from "@/lib/resendClient";

export async function sendAutomationSms({
  userId,
  to,
  body,
  contactId,
}: {
  userId: string;
  to: string;
  body: string;
  contactId?: string | null;
}) {
  console.log("📨 [AUTOMATION] Sending SMS →", to, body);
  return sendSms({ userId, to, body, contactId: contactId ?? null, source: "autopilot" });
}

export async function sendAutomationEmail({ to, subject, html }) {
  console.log("📧 [AUTOMATION] Sending EMAIL →", to, subject);
  return sendEmail({ to, subject, html });
}
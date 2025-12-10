// src/lib/automations/messaging.ts
// src/lib/automations/messaging.ts

import { sendSms } from "@/lib/twilioClient";
import { sendEmail } from "@/lib/resendClient";

export async function sendAutomationSms({ to, body }) {
  console.log("📨 [AUTOMATION] Sending SMS →", to, body);
  return sendSms(to, body);
}

export async function sendAutomationEmail({ to, subject, html }) {
  console.log("📧 [AUTOMATION] Sending EMAIL →", to, subject);
  return sendEmail({ to, subject, html });
}
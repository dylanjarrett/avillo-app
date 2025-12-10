// src/lib/automation/messaging.ts
import { sendSms } from "@/lib/twilioClient";
import { sendEmail } from "@/lib/resendClient";

export async function sendAutomationSms(params: {
  to: string;
  body: string;
}) {
  if (!params.to) throw new Error("Missing phone number for SMS step");
  return sendSms(params.to, params.body);
}

export async function sendAutomationEmail(params: {
  to: string;
  subject: string;
  html: string;
}) {
  if (!params.to) throw new Error("Missing email for EMAIL step");
  return sendEmail({
    to: params.to,
    subject: params.subject,
    html: params.html,
  });
}
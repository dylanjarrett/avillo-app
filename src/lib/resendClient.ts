// src/lib/resendClient.ts
import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;
const fromEmail = process.env.RESEND_FROM_EMAIL;

if (!apiKey) {
  console.warn("[Resend] RESEND_API_KEY is not set. Email sending will fail.");
}

if (!fromEmail) {
  console.warn(
    "[Resend] RESEND_FROM_EMAIL is not set. Using a default will likely fail DMARC."
  );
}

export const resend = new Resend(apiKey || "");

export type SendEmailOptions = {
  to: string | string[];
  subject: string;
  html: string;
  fromOverride?: string;
  replyTo?: string | string[];
};

export async function sendEmail({
  to,
  subject,
  html,
  fromOverride,
  replyTo,
}: SendEmailOptions) {
  if (!fromEmail && !fromOverride) {
    throw new Error("RESEND_FROM_EMAIL is not configured");
  }

  const { data, error } = await resend.emails.send({
    from: fromOverride || fromEmail!, // e.g. "Avillo <no-reply@avillo.io>"
    to,
    subject,
    html,
    // optional reply-to header so people can respond to support@
    ...(replyTo ? { reply_to: replyTo } : {}),
  });

  if (error) {
    throw error;
  }

  return data;
}

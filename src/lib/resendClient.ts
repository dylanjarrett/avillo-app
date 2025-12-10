// src/lib/resendClient.ts
import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;
const fromEmail = process.env.RESEND_FROM_EMAIL;

if (!apiKey) {
  console.warn(
    "[Resend] RESEND_API_KEY is not set. Email sending will fail."
  );
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
};

export async function sendEmail({
  to,
  subject,
  html,
}: SendEmailOptions) {
  if (!fromEmail) {
    throw new Error("RESEND_FROM_EMAIL is not configured");
  }

  const { data, error } = await resend.emails.send({
    from: fromEmail,
    to,
    subject,
    html,
  });

  if (error) {
    throw error;
  }

  return data;
}
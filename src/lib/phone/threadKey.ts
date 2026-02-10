// src/lib/phone/threadKey.ts
import { normalizeE164 } from "@/lib/phone/normalize";

/**
 * Deterministic thread identity for SMS.
 *
 * IMPORTANT:
 * - Do NOT include contactId. contactId can be null at first and set later,
 *   which would change the key and split history into multiple conversations.
 *
 * Prisma uniqueness is @@unique([workspaceId, threadKey])
 * So threadKey must be stable within a workspace.
 *
 * Identity = (phoneNumberId, otherPartyE164)
 */
export function threadKeyForSms(opts: {
  phoneNumberId: string;
  otherPartyE164: string; // lead/customer phone
}) {
  const phoneNumberId = String(opts.phoneNumberId ?? "").trim();
  const other = normalizeE164(String(opts.otherPartyE164 ?? ""));

  if (!phoneNumberId) throw new Error("threadKeyForSms: missing phoneNumberId");
  if (!other) throw new Error("threadKeyForSms: invalid otherPartyE164");

  // Keep it short and explicit. Fits well under VarChar(160).
  // Example: "sms:pn:<phoneNumberId>:other:+15035551212"
  return `sms:pn:${phoneNumberId}:other:${other}`;
}
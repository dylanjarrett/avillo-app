//lib/phone/threadKey.ts
export function threadKeyForSms(opts: {
  phoneNumberId: string;
  contactId?: string | null;
  otherPartyE164: string; // lead/customer number
}) {
  if (opts.contactId) return `pn:${opts.phoneNumberId}:contact:${opts.contactId}`;
  return `pn:${opts.phoneNumberId}:lead:${opts.otherPartyE164}`;
}
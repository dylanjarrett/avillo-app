// src/lib/phone/normalize.ts

/**
 * Normalize to E.164-ish:
 * - strips all non-digits
 * - US-centric:
 *    10 digits => +1XXXXXXXXXX
 *    11 digits starting with 1 => +1XXXXXXXXXX
 * - otherwise => +<digits>
 *
 * Returns "" if invalid/unusable.
 *
 * NOTE: Prisma fields use @db.VarChar(32), so we also sanity-check length.
 */
export function normalizeE164(input: string) {
  const raw = String(input ?? "").trim();
  if (!raw) return "";

  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";

  let e164 = "";

  if (digits.length === 10) e164 = `+1${digits}`;
  else if (digits.length === 11 && digits.startsWith("1")) e164 = `+${digits}`;
  else {
    // E.164 allows up to 15 digits after +. Keep it within reason.
    if (digits.length < 8 || digits.length > 15) return "";
    e164 = `+${digits}`;
  }

  // Extra guard for schema: VarChar(32) (we're way under, but be safe)
  if (e164.length > 32) return "";

  return e164;
}

export function upperTrim(input: string) {
  return String(input ?? "").trim().toUpperCase();
}

export function safeStr(v: any): string | null {
  const s = String(v ?? "").trim();
  return s.length ? s : null;
}
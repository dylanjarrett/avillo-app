//lib/phone/normalize.ts
export function normalizeE164(input: string) {
  const raw = String(input ?? "").trim();
  if (!raw) return "";

  // Keep only digits (and a leading + if present)
  const hasPlus = raw.startsWith("+");
  const digitsOnly = raw.replace(/\D/g, "");

  if (!digitsOnly) return "";

  // If user provided a +, we still normalize formatting consistently
  // US-centric normalization:
  // - 10 digits => +1XXXXXXXXXX
  // - 11 digits starting with 1 => +1XXXXXXXXXX
  // Otherwise: assume already includes country code and prefix +
  if (digitsOnly.length === 10) return `+1${digitsOnly}`;
  if (digitsOnly.length === 11 && digitsOnly.startsWith("1")) return `+${digitsOnly}`;

  // If they typed +<country><number> but it wasn't US-length, keep it as +digits
  // If they typed without +, still return +digits
  return `+${digitsOnly}`;
}

export function upperTrim(input: string) {
  return String(input ?? "").trim().toUpperCase();
}

export function safeStr(v: any): string | null {
  const s = String(v ?? "").trim();
  return s.length ? s : null;
}
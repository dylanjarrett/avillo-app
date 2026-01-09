// src/lib/pins/normalizePin.ts

export function safeTrim(v?: string | null) {
  const t = String(v ?? "").trim();
  return t.length ? t : "";
}

/**
 * Normalize a pin name for:
 * - display: cleaned human label (name)
 * - identity: stable dedupe key (nameKey)
 *
 * Goals:
 * - collapse whitespace
 * - normalize unicode (remove diacritics)
 * - keep names readable
 * - generate a consistent nameKey for de-duping
 */
export function normalizePinName(v?: string | null) {
  // 1) Trim + collapse whitespace
  const raw = safeTrim(v).replace(/\s+/g, " ");

  // 2) Unicode normalize + strip diacritics (NFKD)
  const noDiacritics = raw
    .normalize("NFKD")
    // remove combining marks
    .replace(/[\u0300-\u036f]/g, "");

  // 3) Clean punctuation (keep letters/numbers/spaces and a few separators)
  //    - allow: letters, numbers, spaces
  //    - allow: hyphen, slash, ampersand, plus, apostrophe, period
  //    - convert underscores to spaces
  const cleaned = noDiacritics
    .replace(/_/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\p{L}\p{N}\s\-\/&+.'"]/gu, "") // drop odd symbols/emojis
    .replace(/\s+/g, " ")
    .trim();

  // 4) Build nameKey (lowercase, normalized separators)
  const nameKey = cleaned
    .toLowerCase()
    .replace(/["']/g, "") // remove quotes in key
    .replace(/\s+/g, " ")
    .trim();

  return { name: cleaned, nameKey };
}
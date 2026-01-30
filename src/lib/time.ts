// src/lib/time.ts
import { DateTime } from "luxon";

/* ------------------------------------------------
 * Timezone helpers
 * ------------------------------------------------*/

/**
 * Validate and return a safe IANA timezone string.
 * Example: "America/Los_Angeles"
 */
export function safeIanaTZ(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;

  const dt = DateTime.now().setZone(s);
  return dt.isValid ? s : null;
}

/* ------------------------------------------------
 * Minute normalization (GLOBAL RULE)
 * ------------------------------------------------*/

/**
 * Normalize any Date to minute precision.
 * (Seconds + milliseconds = 0)
 */
export function normalizeToMinute(d: Date): Date {
  const x = new Date(d);
  x.setSeconds(0, 0);
  return x;
}

/* ------------------------------------------------
 * Unified task datetime parsing
 * ------------------------------------------------*/

/**
 * Parse a task datetime input into a minute-stable Date.
 *
 * Supports:
 * - Date instance
 * - ISO w/ offset or Z  → treated as an absolute instant
 * - Local ISO (YYYY-MM-DDTHH:mm[:ss]) → interpreted in tz (or UTC)
 *
 * ALWAYS returns a minute-stable Date or null.
 */
export function parseTaskInstant(raw: unknown, tz?: unknown): Date | null {
  if (!raw) return null;

  // Date passthrough
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? null : normalizeToMinute(raw);
  }

  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s) return null;

  const zone = safeIanaTZ(tz) ?? "UTC";
  const hasOffset = /([zZ]|[+\-]\d{2}:\d{2})$/.test(s);

  // If the string includes an offset/Z, we treat it as an absolute instant.
  // If it does not, interpret it in the provided zone (or UTC).
  const dt = hasOffset ? DateTime.fromISO(s) : DateTime.fromISO(s, { zone });

  if (!dt.isValid) return null;
  return normalizeToMinute(dt.toJSDate());
}

/* ------------------------------------------------
 * Display helpers (AI + UI consistency)
 * ------------------------------------------------*/

/**
 * Format a JS Date for display in a timezone.
 * Defaults to a clean Tasks-like label: "Jan 30, 2026, 2:00 PM"
 *
 * IMPORTANT: This is display-only. It does NOT change stored instants.
 */
export function formatDateTimeForTZ(
  d: Date | null | undefined,
  tz: string | null,
  opts?: { includeYear?: boolean }
): string | null {
  if (!d) return null;

  const zone = safeIanaTZ(tz) ?? "UTC";
  const dt = DateTime.fromJSDate(d, { zone });
  if (!dt.isValid) return null;

  const includeYear = opts?.includeYear ?? true;

  // Match your Tasks panel vibe (date + time, 12-hour, minute precision).
  // Example: "Jan 30, 2026, 2:00 PM"
  return dt.toFormat(includeYear ? "LLL d, yyyy, h:mm a" : "LLL d, h:mm a");
}

/**
 * Same as above, but also returns the IANA zone used.
 */
export function formatDateTimeForTZWithZone(d: Date | null | undefined, tz: string | null) {
  const zone = safeIanaTZ(tz) ?? "UTC";
  return { zone, label: formatDateTimeForTZ(d ?? null, zone) };
}

/* ------------------------------------------------
 * Task config → dueAt resolution (Automations)
 * ------------------------------------------------*/

function toFiniteNumber(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Resolve a task dueAt from a TASK step config.
 *
 * Priority:
 * 1) Absolute datetime fields
 * 2) Relative offsets
 * 3) null (caller decides fallback)
 */
export function computeTaskDueAtFromConfig(
  config: any,
  base: Date
): {
  dueAt: Date | null;
  source: "absolute" | "relative" | "none";
} {
  const absolute =
    config?.dueAt ??
    config?.taskAt ??
    config?.reminderAt ??
    config?.date ??
    config?.datetime ??
    null;

  const parsedAbsolute = parseTaskInstant(absolute, config?.tz);
  if (parsedAbsolute) return { dueAt: parsedAbsolute, source: "absolute" };

  const minutes = toFiniteNumber(config?.dueInMinutes ?? config?.minutes);
  const hours = toFiniteNumber(config?.dueInHours ?? config?.hours);
  const days = toFiniteNumber(config?.dueInDays ?? config?.days);

  if (!minutes && !hours && !days) return { dueAt: null, source: "none" };

  const d = new Date(base);
  d.setMinutes(d.getMinutes() + minutes + hours * 60);
  d.setDate(d.getDate() + days);

  return { dueAt: normalizeToMinute(d), source: "relative" };
}

/* ------------------------------------------------
 * Day boundaries (Dashboard scopes)
 * ------------------------------------------------*/

/**
 * Get start boundaries for Today / Tomorrow / +7 days
 * in a specific timezone.
 */
export function dayBoundsForTZ(tz: string | null, now = DateTime.now()) {
  const zone = safeIanaTZ(tz) ?? "UTC";
  const zNow = now.setZone(zone);

  const todayStart = zNow.startOf("day");
  const tomorrowStart = todayStart.plus({ days: 1 });
  const in7Start = todayStart.plus({ days: 7 });

  return {
    zone,
    todayStart: todayStart.toJSDate(),
    tomorrowStart: tomorrowStart.toJSDate(),
    in7Start: in7Start.toJSDate(),
  };
}

/**
 * End-of-day helper for a given date string (YYYY-MM-DD)
 * in a specific timezone.
 *
 * IMPORTANT: returns minute-stable end-of-day (23:59:00.000) to match the global rule.
 */
export function endOfDayForTZ(tz: string | null, isoDate: string): Date | null {
  const zone = safeIanaTZ(tz) ?? "UTC";
  const dt = DateTime.fromISO(isoDate, { zone });
  if (!dt.isValid) return null;

  // Luxon endOf("day") => 23:59:59.999, but we normalize to minute precision globally.
  return normalizeToMinute(dt.endOf("day").toJSDate());
}
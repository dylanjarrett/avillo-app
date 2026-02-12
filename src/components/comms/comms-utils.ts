// src/components/comms/comms-utils.ts

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/**
 * General-purpose timestamp (used in thread messages, calls, etc.)
 * Example: "Feb 11, 6:44 AM"
 */
export function formatWhen(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";

  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Sidebar conversation list timestamp formatting (iMessage-ish):
 * - today => time only (10:43 AM)
 * - past 6 days => weekday (Monday)
 * - older => M/D/YY (2/4/26)
 */
export function formatListTimestamp(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";

  const now = new Date();

  // Compare by local calendar day (midnight boundaries)
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
  const a = startOfDay(d).getTime();
  const b = startOfDay(now).getTime();

  const diffDays = Math.floor((b - a) / (24 * 60 * 60 * 1000)); // how many full days ago

  // Today (or future edge cases) => time only
  if (diffDays <= 0) {
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }).format(d);
  }

  // Within past 6 days => weekday
  if (diffDays <= 6) {
    return new Intl.DateTimeFormat(undefined, {
      weekday: "long",
    }).format(d);
  }

  // Older than 6 days => M/D/YY (no leading zeros)
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const yy = String(d.getFullYear()).slice(-2);
  return `${m}/${day}/${yy}`;
}

export function normalizePhone(input: string) {
  return String(input || "").replace(/[^\d+]/g, "").trim();
}

export function initials(s: string) {
  const t = String(s || "").trim();
  if (!t) return "U";
  const parts = t.split(/\s+/g).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase()).join("");
}
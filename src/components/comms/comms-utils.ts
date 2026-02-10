// src/components/comms/comms-utils.ts
export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

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

export function normalizePhone(input: string) {
  return String(input || "").replace(/[^\d+]/g, "").trim();
}

export function initials(s: string) {
  const t = String(s || "").trim();
  if (!t) return "U";
  const parts = t.split(/\s+/g).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase()).join("");
}
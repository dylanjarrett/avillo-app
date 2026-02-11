// src/components/comms/api.ts
import type { CallItem, Conversation, SmsMessage } from "./comms-types";

/* -----------------------------
 * Core helpers (API + error parsing)
 * ---------------------------- */

function isAbortError(err: any) {
  return (
    err?.name === "AbortError" ||
    err?.code === "ABORT_ERR" ||
    String(err?.message ?? "").toLowerCase().includes("aborted")
  );
}

/**
 * Used by UI to decide whether to show the "Comms locked" banner.
 * Keep this in api.ts so every fetch can reliably throw a consistent message.
 */
export function looksLikeEntitlementError(msg?: string | null) {
  const s = String(msg ?? "").toLowerCase();
  return (
    s.includes("choose a plan") ||
    (s.includes("plan") && s.includes("continue")) ||
    s.includes("subscription") ||
    s.includes("past due") ||
    s.includes("canceled") ||
    s.includes("inactive") ||
    (s.includes("requires") && s.includes("pro")) ||
    (s.includes("comms") && (s.includes("enabled") || s.includes("not")))
  );
}

/**
 * UI-safe message normalization for thrown errors from API calls.
 * (CommsShell previously had this inline.)
 */
export function normalizeApiError(e: any, fallback: string) {
  const raw =
    (typeof e?.message === "string" && e.message) ||
    (typeof e?.error === "string" && e.error) ||
    "";
  const msg = String(raw || "").trim();
  if (!msg) return fallback;

  const head = msg.slice(0, 250).toLowerCase();
  const looksLikeHtml =
    head.includes("<!doctype") ||
    head.includes("<html") ||
    head.includes("<head") ||
    head.includes("<body") ||
    head.includes("<meta") ||
    head.includes("<link") ||
    head.includes("next_static");
  if (looksLikeHtml) return fallback;

  if (msg.length > 500) return msg.slice(0, 500) + "…";
  return msg;
}

async function safeParseResponse(res: Response): Promise<{ data: any; text: string | null }> {
  // Try JSON first, but gracefully fall back to text.
  const contentType = res.headers.get("content-type") || "";
  try {
    if (contentType.includes("application/json")) {
      const data = await res.json().catch(() => ({}));
      return { data, text: null };
    }
    const text = await res.text().catch(() => "");
    // attempt JSON if server forgot content-type
    const maybeJson = text
      ? (() => {
          try {
            return JSON.parse(text);
          } catch {
            return null;
          }
        })()
      : null;
    return { data: maybeJson ?? {}, text: maybeJson ? null : text };
  } catch {
    return { data: {}, text: null };
  }
}

/**
 * Normalizes our API error shapes into a single message.
 * Supports:
 * - { error: "msg" }
 * - { message: "msg" }
 * - { error: { message: "msg", ... } } (entitlements + other)
 * - { error: { error: "msg" } } (legacy)
 * - plain text responses
 */
function extractErrorMessage(payload: { data: any; text: string | null }, res: Response) {
  const data = payload.data ?? {};
  const text = payload.text;

  const e = data?.error;

  const msg =
    // entitlements-style
    (typeof e === "object" && e && (e.message || e.error)) ||
    // string error
    (typeof e === "string" ? e : null) ||
    // sometimes: { errors: [{ message }] }
    (Array.isArray(data?.errors) && data.errors[0]?.message) ||
    // top-level message
    data?.message ||
    // raw text fallback
    (text && text.trim().slice(0, 300)) ||
    `Request failed (${res.status})`;

  return String(msg);
}

async function requestJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit & { signal?: AbortSignal }
): Promise<T> {
  const res = await fetch(input, init);
  const payload = await safeParseResponse(res);

  if (!res.ok) {
    throw new Error(extractErrorMessage(payload, res));
  }

  // ✅ allow null JSON (e.g. /number/me returns null when none exists)
  return payload.data as T;
}

/* -----------------------------
 * Shapers (align to route payloads)
 * ---------------------------- */

function toConversation(raw: any): Conversation | null {
  const id = String(raw?.id ?? "");
  if (!id) return null;

  const contact = raw?.contact ?? null;
  const contactName = [contact?.firstName, contact?.lastName].filter(Boolean).join(" ").trim();

  const title = raw?.displayName || contactName || raw?.title || raw?.contactName;
  const phone =
    raw?.otherPartyE164 ?? 
    raw?.phone ??
    contact?.phone ??
    raw?.otherPhone ??
    raw?.to ??
    raw?.from ??
    null;

  return {
    id,
    title: String(title || phone || "Unknown"),
    subtitle: raw?.subtitle ?? (phone ? String(phone) : null),
    phone: phone ? String(phone) : null,
    contactId: raw?.contactId ?? null,
    lastMessagePreview: raw?.lastMessagePreview ?? raw?.preview ?? raw?.lastMessageBody ?? null,
    lastMessageAt: raw?.lastMessageAt ?? raw?.lastSmsAt ?? null,
    updatedAt: raw?.updatedAt ?? null,
    unreadCount: typeof raw?.unreadCount === "number" ? raw.unreadCount : 0,
  };
}

function toMessage(raw: any, conversationId: string): SmsMessage | null {
  if (!raw) return null;

  // ---------- id (accept many shapes, but require one) ----------
  const id = String(
    raw.id ??
      raw.sid ??
      raw.messageSid ??
      raw.smsSid ??
      raw.twilioSid ??
      raw.providerSid ??
      raw.providerMessageId ??
      raw.message_id ??
      raw.messageId ??
      ""
  ).trim();

  if (!id) return null;

  // ---------- createdAt (NEVER drop for missing timestamps) ----------
  const createdAtRaw =
    raw.createdAt ??
    raw.created_at ??
    raw.sentAt ??
    raw.sent_at ??
    raw.receivedAt ??
    raw.received_at ??
    raw.dateCreated ??
    raw.date_created ??
    raw.timestamp ??
    raw.time ??
    null;

  // Normalize to a usable ISO string when possible; otherwise fall back to "now"
  let createdAt = "";
  if (createdAtRaw instanceof Date) {
    createdAt = createdAtRaw.toISOString();
  } else if (typeof createdAtRaw === "number") {
    createdAt = new Date(createdAtRaw).toISOString();
  } else if (typeof createdAtRaw === "string") {
    const s = createdAtRaw.trim();
    // If it's parseable, keep the original string (often already ISO)
    createdAt = Number.isNaN(Date.parse(s)) ? "" : s;
  }

  if (!createdAt) createdAt = new Date().toISOString();

  // ---------- from/to ----------
  const fromRaw = raw.fromNumber ?? raw.from ?? raw.fromE164 ?? raw.from_e164 ?? null;
  const toRaw = raw.toNumber ?? raw.to ?? raw.toE164 ?? raw.to_e164 ?? null;

  const from = fromRaw != null ? String(fromRaw).trim() : null;
  const to = toRaw != null ? String(toRaw).trim() : null;

  // ---------- direction ----------
  const dirRaw = String(
    raw.direction ??
      raw.dir ??
      raw.type ??
      raw.messageDirection ??
      raw.message_direction ??
      ""
  )
    .toUpperCase()
    .trim();

  const direction: SmsMessage["direction"] =
    dirRaw === "INBOUND"
      ? "INBOUND"
      : dirRaw === "OUTBOUND"
        ? "OUTBOUND"
        : "SYSTEM";

  // ---------- body/status ----------
  const body = String(raw.body ?? raw.text ?? raw.message ?? raw.content ?? "");
  const statusRaw = raw.status ?? raw.messageStatus ?? raw.message_status ?? null;
  const status = statusRaw != null ? String(statusRaw) : null;

  return {
    id,
    conversationId,
    direction,
    body,
    from: from || null,
    to: to || null,
    status,
    createdAt,
  };
}

function toCall(raw: any, conversationId: string): CallItem | null {
  const id = String(raw?.id ?? "");
  if (!id) return null;

  const dirRaw = String(raw?.direction ?? "").toUpperCase();
  const direction: CallItem["direction"] = dirRaw === "INBOUND" ? "INBOUND" : "OUTBOUND";

  const duration =
    typeof raw?.durationSec === "number"
      ? raw.durationSec
      : raw?.duration != null && raw?.duration !== ""
        ? Number(raw.duration)
        : null;

  return {
    id,
    conversationId,
    direction,
    status: raw?.status ?? null,
    from: raw?.fromNumber ?? raw?.from ?? null,
    to: raw?.toNumber ?? raw?.to ?? null,
    durationSec: Number.isFinite(duration as any) ? (duration as number) : null,
    startedAt: raw?.startedAt ?? raw?.startTime ?? null,
    endedAt: raw?.endedAt ?? raw?.endTime ?? null,
    createdAt: raw?.createdAt ?? null,
  };
}

/* -----------------------------
 * Public API (align to routes)
 * ---------------------------- */

export async function listConversations(signal?: AbortSignal): Promise<Conversation[]> {
  try {
    const data = await requestJson<any>("/api/sms/conversations", {
      method: "GET",
      cache: "no-store",
      signal,
    });

    const raw = data?.items ?? data?.conversations ?? data?.threads ?? [];
    return (Array.isArray(raw) ? raw : []).map(toConversation).filter(Boolean) as Conversation[];
  } catch (err) {
    if (isAbortError(err)) return [];
    throw err;
  }
}

export async function listMessages(conversationId: string, signal?: AbortSignal): Promise<SmsMessage[]> {
  try {
    const data = await requestJson<any>(`/api/sms/conversations/${conversationId}/messages`, {
      method: "GET",
      cache: "no-store",
      signal,
    });

    const raw = data?.items ?? data?.messages ?? data?.data ?? [];
    const mapped = (Array.isArray(raw) ? raw : []).map((m) => toMessage(m, conversationId));
    const dropped = mapped.filter((x) => !x).length;
      if (process.env.NODE_ENV !== "production" && dropped) {
        console.warn("[comms] dropped messages during mapping:", dropped, raw);
      }
    return mapped.filter(Boolean) as SmsMessage[];
  } catch (err) {
    if (isAbortError(err)) return [];
    throw err;
  }
}

export async function sendSms(input: {
  conversationId?: string | null;
  to: string;
  body: string;
  contactId?: string | null;
  listingId?: string | null;
  phoneNumberId?: string | null;
}) {
  return requestJson<{ sid: string; status: string | null }>("/api/sms/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function startCall(input: {
  conversationId?: string | null;
  to: string;
  contactId?: string | null;
  listingId?: string | null;
  phoneNumberId?: string | null;
}) {
  return requestJson<{ callId: string; callSid: string; status: string | null }>("/api/calls/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function listCalls(conversationId: string, signal?: AbortSignal): Promise<CallItem[]> {
  try {
    const data = await requestJson<any>(`/api/calls/conversations/${conversationId}`, {
      method: "GET",
      cache: "no-store",
      signal,
    });

    const raw = data?.items ?? data?.calls ?? data?.data ?? [];
    return (Array.isArray(raw) ? raw : []).map((c) => toCall(c, conversationId)).filter(Boolean) as CallItem[];
  } catch (err) {
    if (isAbortError(err)) return [];
    throw err;
  }
}

/* -----------------------------
 * Phone number helpers (Twilio)
 * ---------------------------- */

export type MyNumber = {
  id: string;
  e164: string;
  status: string;
};

export async function getMyNumber(signal?: AbortSignal): Promise<MyNumber | null> {
  const data = await requestJson<any>("/api/twilio/number/me", {
    method: "GET",
    cache: "no-store",
    signal,
  });

  // Route returns either a number object OR null
  if (!data) return null;

  const id = String(data?.id ?? "");
  const e164 = String(data?.e164 ?? "");
  if (!id || !e164) return null;

  return { id, e164, status: String(data?.status ?? "ACTIVE") };
}

export async function provisionMyNumber(input?: { areaCode?: string | null }) {
  return requestJson<any>("/api/twilio/number/provision", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ areaCode: input?.areaCode ?? null }),
  });
}

/* -----------------------------
 * Convenience: shared "refresh & reselect" behavior
 * (extracted from CommsShell)
 * ---------------------------- */

/**
 * Refreshes conversations, sorts them, and finds a matching conversation by normalized phone.
 * Returns:
 * - sorted list (always)
 * - match conversation (if found)
 */
export async function refreshConversationsSortedAndFindByPhone(input: {
  targetPhone: string;
  signal?: AbortSignal;
}): Promise<{ items: Conversation[]; match: Conversation | null }> {
  const { targetPhone, signal } = input;

  const items = await listConversations(signal);

  const sorted = items
    .slice()
    .sort((a, b) => {
      const at = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const bt = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return bt - at;
    });

  const normalize = (v: string | null | undefined) => String(v ?? "").replace(/[^\d+]/g, "").trim();
  const match = sorted.find((c) => normalize(c.phone || c.subtitle || "") === normalize(targetPhone)) ?? null;

  return { items: sorted, match };
}
// src/components/comms/apis.ts
import type { CallItem, Conversation, SmsMessage } from "./comms-types";

/* -----------------------------
 * Core helpers
 * ---------------------------- */

function isAbortError(err: any) {
  return (
    err?.name === "AbortError" ||
    err?.code === "ABORT_ERR" ||
    String(err?.message ?? "").toLowerCase().includes("aborted")
  );
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
    const maybeJson = text ? (() => { try { return JSON.parse(text); } catch { return null; } })() : null;
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
  const id = String(raw?.id ?? "");
  const createdAt = raw?.createdAt ?? raw?.sentAt ?? raw?.receivedAt;
  if (!id || !createdAt) return null;

  const dirRaw = String(raw?.direction ?? raw?.dir ?? raw?.type ?? "").toUpperCase();
  const direction: SmsMessage["direction"] =
    dirRaw === "INBOUND" ? "INBOUND" : dirRaw === "OUTBOUND" ? "OUTBOUND" : "SYSTEM";

  return {
    id,
    conversationId,
    direction,
    body: String(raw?.body ?? raw?.text ?? raw?.message ?? ""),
    from: raw?.fromNumber ?? raw?.from ?? null,
    to: raw?.toNumber ?? raw?.to ?? null,
    status: raw?.status ?? null,
    createdAt: String(createdAt),
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
    return (Array.isArray(raw) ? raw : [])
      .map((m) => toMessage(m, conversationId))
      .filter(Boolean) as SmsMessage[];
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
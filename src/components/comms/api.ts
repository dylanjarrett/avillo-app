// src/components/comms/api.ts
import type { CallItem, Conversation, SmsMessage } from "./comms-types";

/* ============================================================
   Core helpers (API + error parsing)
============================================================ */

function isAbortError(err: any) {
  return (
    err?.name === "AbortError" ||
    err?.code === "ABORT_ERR" ||
    String(err?.message ?? "").toLowerCase().includes("aborted")
  );
}

export function looksLikeEntitlementError(msg?: string | null) {
  const s = String(msg ?? "").toLowerCase();
  return (
    s.includes("choose a plan") ||
    (s.includes("plan") && s.includes("continue")) ||
    s.includes("subscription") ||
    s.includes("past due") ||
    s.includes("canceled") ||
    s.includes("inactive") ||
    (s.includes("requires") && s.includes("pro"))
  );
}

export function normalizeApiError(e: any, fallback: string) {
  const raw =
    (typeof e?.message === "string" && e.message) ||
    (typeof e?.error === "string" && e.error) ||
    "";

  const msg = String(raw || "").trim();
  if (!msg) return fallback;

  const head = msg.slice(0, 250).toLowerCase();
  if (
    head.includes("<!doctype") ||
    head.includes("<html") ||
    head.includes("<head") ||
    head.includes("<body")
  ) {
    return fallback;
  }

  if (msg.length > 500) return msg.slice(0, 500) + "…";
  return msg;
}

async function safeParseResponse(res: Response): Promise<{ data: any; text: string | null }> {
  const contentType = res.headers.get("content-type") || "";

  try {
    if (contentType.includes("application/json")) {
      const data = await res.json().catch(() => ({}));
      return { data, text: null };
    }

    const text = await res.text().catch(() => "");
    try {
      const parsed = JSON.parse(text);
      return { data: parsed, text: null };
    } catch {
      return { data: {}, text };
    }
  } catch {
    return { data: {}, text: null };
  }
}

function extractErrorMessage(
  payload: { data: any; text: string | null },
  res: Response
) {
  const data = payload.data ?? {};
  const text = payload.text;

  const e = data?.error;

  const msg =
    (typeof e === "object" && e && (e.message || e.error)) ||
    (typeof e === "string" ? e : null) ||
    (Array.isArray(data?.errors) && data.errors[0]?.message) ||
    data?.message ||
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

  return payload.data as T;
}

/* ============================================================
   Shapers
============================================================ */

function toConversation(raw: any): Conversation | null {
  const id = String(raw?.id ?? "").trim();
  if (!id) return null;

  const contact = raw?.contact ?? null;
  const contactName = [contact?.firstName, contact?.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();

  const phone =
    raw?.otherPartyE164 ??
    contact?.phone ??
    null;

  const title =
    raw?.displayName ||
    contactName ||
    phone ||
    "Unknown";

  const lastMessageAt = raw?.lastMessageAt ?? null;

  const lastMessagePreview =
    raw?.lastMessagePreview ??
    raw?.preview ??
    raw?.lastMessageBody ??
    null;

  const isDraft =
    !lastMessageAt &&
    !lastMessagePreview;

  return {
    id,
    title: String(title),
    subtitle: phone ? String(phone) : null,
    phone: phone ? String(phone) : null,
    contactId: raw?.contactId ?? null,
    lastMessagePreview,
    lastMessageAt,
    updatedAt: raw?.updatedAt ?? null,
    unreadCount: typeof raw?.unreadCount === "number" ? raw.unreadCount : 0,
    isDraft,
  };
}

function toMessage(raw: any, conversationId: string): SmsMessage | null {
  if (!raw) return null;

  const id = String(
    raw.id ??
    raw.twilioSid ??
    raw.sid ??
    ""
  ).trim();

  if (!id) return null;

  const createdAt =
    raw.createdAt ??
    raw.sentAt ??
    raw.receivedAt ??
    new Date().toISOString();

  const dir = String(raw.direction ?? "").toUpperCase();

  return {
    id,
    conversationId,
    direction:
      dir === "INBOUND"
        ? "INBOUND"
        : dir === "OUTBOUND"
          ? "OUTBOUND"
          : "SYSTEM",
    body: String(raw.body ?? ""),
    from: raw.fromNumber ?? null,
    to: raw.toNumber ?? null,
    status: raw.status ?? null,
    createdAt,
  };
}

function toCall(raw: any, conversationId: string): CallItem | null {
  if (!raw?.id) return null;

  const dir = String(raw.direction ?? "").toUpperCase();

  return {
    id: String(raw.id),
    conversationId,
    direction: dir === "INBOUND" ? "INBOUND" : "OUTBOUND",
    status: raw.status ?? null,
    from: raw.fromNumber ?? null,
    to: raw.toNumber ?? null,
    durationSec: raw.durationSec ?? null,
    startedAt: raw.startedAt ?? null,
    endedAt: raw.endedAt ?? null,
    createdAt: raw.createdAt ?? null,
  };
}

/* ============================================================
   Public API
============================================================ */

export async function listConversations(
  signal?: AbortSignal
): Promise<Conversation[]> {
  try {
    const data = await requestJson<any>("/api/sms/conversations", {
      method: "GET",
      cache: "no-store",
      signal,
    });

    const raw = data?.items ?? data?.conversations ?? [];
    return (Array.isArray(raw) ? raw : [])
      .map(toConversation)
      .filter(Boolean) as Conversation[];
  } catch (err) {
    if (isAbortError(err)) return [];
    throw err;
  }
}

export type CommsContactHit = {
  id: string;
  name: string;
  phone: string;
  relationshipType?: string;
  visibility?: string;
  ownerUserId?: string | null;
};

export async function searchCommsContacts(input: {
  q: string;
  take?: number;
  signal?: AbortSignal;
}): Promise<CommsContactHit[]> {
  const q = String(input.q ?? "").trim();
  if (!q) return [];

  const take = Math.min(Math.max(Number(input.take ?? 8) || 8, 1), 20);

  try {
    const data = await requestJson<any>(
      `/api/sms/conversations/contacts?q=${encodeURIComponent(q)}&take=${take}`,
      {
        method: "GET",
        cache: "no-store",
        signal: input.signal,
      }
    );

    const raw = data?.contacts ?? data?.items ?? [];
    return (Array.isArray(raw) ? raw : [])
      .map((c: any) => ({
        id: String(c?.id ?? "").trim(),
        name: String(c?.name ?? "").trim(),
        phone: String(c?.phone ?? "").trim(),
        relationshipType: c?.relationshipType ?? undefined,
        visibility: c?.visibility ?? undefined,
        ownerUserId: c?.ownerUserId ?? null,
      }))
      .filter((c: any) => c.id && c.phone);
  } catch (err) {
    if (isAbortError(err)) return [];
    throw err;
  }
}

export async function createDraftConversation(input: {
  to: string;
  contactId?: string | null;
  listingId?: string | null;
}): Promise<Conversation> {
  try {
    const data = await requestJson<any>("/api/sms/conversations/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input ?? {}),
    });

    // Route returns: { conversation: ... }
    const raw = data?.conversation ?? data?.data ?? data;
    const convo = toConversation(raw);

    if (!convo?.id) {
      throw new Error("Draft created but response was missing a conversation id.");
    }

    return convo;
  } catch (e: any) {
    // keep consistent error style for UI gating
    throw new Error(normalizeApiError(e, "Failed to create draft conversation."));
  }
}

export async function listMessages(
  conversationId: string,
  signal?: AbortSignal
): Promise<SmsMessage[]> {
  try {
    const data = await requestJson<any>(
      `/api/sms/conversations/${conversationId}/messages`,
      {
        method: "GET",
        cache: "no-store",
        signal,
      }
    );

    const raw = data?.items ?? data?.messages ?? [];
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
  return requestJson<any>("/api/sms/send", {
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
  return requestJson<any>("/api/calls/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function listCalls(
  conversationId: string,
  signal?: AbortSignal
): Promise<CallItem[]> {
  try {
    const data = await requestJson<any>(
      `/api/calls/conversations/${conversationId}`,
      {
        method: "GET",
        cache: "no-store",
        signal,
      }
    );

    const raw = data?.items ?? data?.calls ?? [];
    return (Array.isArray(raw) ? raw : [])
      .map((c) => toCall(c, conversationId))
      .filter(Boolean) as CallItem[];
  } catch (err) {
    if (isAbortError(err)) return [];
    throw err;
  }
}

/* ============================================================
   Phone helpers
============================================================ */

export type MyNumber = {
  id: string;
  e164: string;
  status: string;
};

export async function getMyNumber(
  signal?: AbortSignal
): Promise<MyNumber | null> {
  const data = await requestJson<any>(
    "/api/twilio/number/me",
    {
      method: "GET",
      cache: "no-store",
      signal,
    }
  );

  if (!data?.id || !data?.e164) return null;

  return {
    id: String(data.id),
    e164: String(data.e164),
    status: String(data.status ?? "ACTIVE"),
  };
}

export async function provisionMyNumber(input?: {
  areaCode?: string | null;
}) {
  return requestJson<any>(
    "/api/twilio/number/provision",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        areaCode: input?.areaCode ?? null,
      }),
    }
  );
}
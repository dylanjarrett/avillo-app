//app/(portal)/comms/page.tsx
"use client";

import PageHeader from "@/components/layout/page-header";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useCommsMobileWorkspaceScroll } from "@/hooks/useCommsMobileWorkspaceScroll";

import type { CallItem, Conversation, SmsMessage } from "@/components/comms/comms-types";
import {
  listCalls,
  listConversations,
  listMessages,
  sendSms,
  startCall,
  getMyNumber,
  provisionMyNumber,
  looksLikeEntitlementError,
  normalizeApiError,
  createDraftConversation,
  searchCommsContacts,
  type CommsContactHit,
  type MyNumber,
} from "@/components/comms/api";
import { cx, formatListTimestamp, formatWhen, initials, normalizePhone } from "@/components/comms/comms-utils";


type DraftMap = Record<string, string>;
type Mode = "chat" | "calls";

function isAbortError(err: any) {
  return (
    err?.name === "AbortError" ||
    err?.code === "ABORT_ERR" ||
    String(err?.message ?? "").toLowerCase().includes("aborted")
  );
}

function shortPhone(p?: string | null) {
  const s = String(p ?? "").trim();
  if (!s) return "";
  return s;
}

function looksLikePhoneInput(v: string) {
  const s = String(v ?? "").trim();
  if (!s) return false;
  // if it contains lots of digits or starts with +, treat as phone-y
  const digits = s.replace(/\D/g, "");
  return s.startsWith("+") || digits.length >= 4;
}

function sortConvos(items: Conversation[]) {
  return items
    .slice()
    .sort((a, b) => {
      const at = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const bt = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return bt - at;
    });
}

export default function Page() {
  const { listHeaderRef, workspaceRef, scrollToWorkspace, scrollBackToListHeader } =
    useCommsMobileWorkspaceScroll();

  const listScrollRef = useRef<HTMLDivElement | null>(null);
  const threadScrollRef = useRef<HTMLDivElement | null>(null);

  // Layout
  const [workspaceOpenMobile, setWorkspaceOpenMobile] = useState(false);

  // Mode
  const [mode, setMode] = useState<Mode>("chat");

  // List + selection
  const [search, setSearch] = useState("");
  const [loadingConvos, setLoadingConvos] = useState(true);
  const [convos, setConvos] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const activeConvo = useMemo(
    () => (selectedId ? convos.find((c) => c.id === selectedId) ?? null : null),
    [selectedId, convos]
  );

  // Messaging
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [msgsError, setMsgsError] = useState<string | null>(null);
  const [messages, setMessages] = useState<SmsMessage[]>([]);
  const [drafts, setDrafts] = useState<DraftMap>({});
  const [sending, setSending] = useState(false);

  // Calls
  const [loadingCalls, setLoadingCalls] = useState(false);
  const [callsError, setCallsError] = useState<string | null>(null);
  const [calls, setCalls] = useState<CallItem[]>([]);

  // Global errors + gate
  const [error, setError] = useState<string | null>(null);
  const [commsLocked, setCommsLocked] = useState(false);
  const [commsLockMsg, setCommsLockMsg] = useState<string | null>(null);

  // Deleting convo
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // My number
  const [myNumber, setMyNumber] = useState<MyNumber | null>(null);
  const [loadingMyNumber, setLoadingMyNumber] = useState(true);
  const [myNumberError, setMyNumberError] = useState<string | null>(null);
  const [areaCode, setAreaCode] = useState("");
  const [provisioningNumber, setProvisioningNumber] = useState(false);

  const hasMyNumber = !!myNumber?.e164;

  const activeDraft = activeConvo?.id ? drafts[activeConvo.id] ?? "" : "";
  const actionsDisabled = commsLocked || sending || !hasMyNumber;

  // Quick start (new thread)
  const [newTo, setNewTo] = useState("");
  const [showComposer, setShowComposer] = useState(false);

  // Contact search (for new thread)
  const [contactHits, setContactHits] = useState<CommsContactHit[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsError, setContactsError] = useState<string | null>(null);
  const [pickedContact, setPickedContact] = useState<CommsContactHit | null>(null);
  const [contactQuery, setContactQuery] = useState(""); // debounced query

  function lockComms(msg?: string | null) {
    setCommsLocked(true);
    setCommsLockMsg(msg || "Comms requires a Pro plan (or Beta access).");
  }

  function unlockComms() {
    setCommsLocked(false);
    setCommsLockMsg(null);
  }

  function safeSetLockFromMessage(msg?: string | null) {
    if (looksLikeEntitlementError(msg)) lockComms(msg);
  }

  // ---------- Load my number ----------
  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        setLoadingMyNumber(true);
        setMyNumberError(null);

        const n = await getMyNumber(controller.signal);
        setMyNumber(n);
      } catch (e: any) {
        if (isAbortError(e)) return;

        const msg = normalizeApiError(e, "We couldn’t load your phone number.");
        setMyNumberError(msg);
        safeSetLockFromMessage(msg);
      } finally {
        setLoadingMyNumber(false);
      }
    }

    load();
    return () => controller.abort();
  }, []);

  async function handleProvisionMyNumber() {
    if (commsLocked) return;

    const acRaw = areaCode.trim();
    const ac = acRaw ? acRaw.replace(/\D/g, "").slice(0, 3) : "";

    try {
      setProvisioningNumber(true);
      setMyNumberError(null);

      await provisionMyNumber({ areaCode: ac || null });

      const n = await getMyNumber();
      setMyNumber(n);
    } catch (e: any) {
      const msg = normalizeApiError(e, "We couldn’t provision a number. Please try again.");
      setMyNumberError(msg);
      safeSetLockFromMessage(msg);
    } finally {
      setProvisioningNumber(false);
    }
  }

  // ---------- Load conversations ----------
  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        setLoadingConvos(true);
        setError(null);

        const items = await listConversations(controller.signal);

        unlockComms();

        const sorted = sortConvos(items);
        setConvos(sorted);

        if (selectedId && !sorted.find((c) => c.id === selectedId)) {
          setSelectedId(null);
        }
      } catch (e: any) {
        if (isAbortError(e)) return;

        const msg = normalizeApiError(e, "We couldn’t load your conversations.");
        setError(msg);
        setConvos([]);
        setSelectedId(null);

        safeSetLockFromMessage(msg);
      } finally {
        setLoadingConvos(false);
      }
    }

    load();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const PREVIEW_MAX_CHARS = 30; // tweak to taste

  function clampPreview(text: string, maxChars: number) {
    const s = String(text ?? "").replace(/\s+/g, " ").trim();
    if (!s) return "—";
    if (s.length <= maxChars) return s;

    // nicer cut: try to cut on a word boundary
    const cut = s.slice(0, maxChars);
    const lastSpace = cut.lastIndexOf(" ");
    const safe = lastSpace > Math.floor(maxChars * 0.65) ? cut.slice(0, lastSpace) : cut;

    return safe.replace(/[.,;:!?]+$/, "").trimEnd() + "…";
  }

  // ---------- Filter list ----------
  const filteredConvos = useMemo(() => {
    let list = convos.slice();
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((c) => {
        const hay = [c.title, c.subtitle, c.phone, c.lastMessagePreview]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }
    return list;
  }, [convos, search]);

  // Mobile: open detail when selecting
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.innerWidth >= 1024) {
      setWorkspaceOpenMobile(false);
      return;
    }

    // If nothing selected, ensure we’re on list
    if (!selectedId) {
      setWorkspaceOpenMobile(false);
      return;
    }

    // Fallback: if selection exists but UI didn’t open for some reason, open it.
    setWorkspaceOpenMobile(true);
  }, [selectedId]);

  // Desktop: keep selection visible
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.innerWidth < 1024) return;
    if (!selectedId) return;

    const container = listScrollRef.current;
    if (!container) return;

    const el = container.querySelector<HTMLElement>(`[data-convo-id="${selectedId}"]`);
    if (!el) return;

    const containerRect = container.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    if (elRect.top < containerRect.top || elRect.bottom > containerRect.bottom) {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedId, filteredConvos.length]);

  // ---------- Load messages ----------
  useEffect(() => {
    if (commsLocked || mode !== "chat" || !activeConvo?.id) {
      setMessages([]);
      setMsgsError(null);
      setLoadingMsgs(false);
      return;
    }

    const controller = new AbortController();

    async function load() {
      try {
        setLoadingMsgs(true);
        setMsgsError(null);

        const items = await listMessages(activeConvo.id, controller.signal);

        const toMs = (v: any) => {
          const t = Date.parse(String(v ?? ""));
          return Number.isNaN(t) ? 0 : t;
        };

        const sorted = items
          .slice()
          .sort((a, b) => {
            const at = toMs(a.createdAt);
            const bt = toMs(b.createdAt);
            if (at === bt) return String(a.id).localeCompare(String(b.id));
            return at - bt;
          });

        setMessages(sorted);
      } catch (e: any) {
        if (isAbortError(e)) return;

        const msg = normalizeApiError(e, "Failed to load messages.");
        setMsgsError(msg);
        safeSetLockFromMessage(msg);
      } finally {
        setLoadingMsgs(false);
      }
    }

    load();
    return () => controller.abort();
  }, [activeConvo?.id, mode, commsLocked]);

  // Auto-scroll thread to bottom when messages change (Apple-y feel)
  useEffect(() => {
    if (mode !== "chat") return;
    const el = threadScrollRef.current;
    if (!el) return;
    const t = setTimeout(() => {
      el.scrollTop = el.scrollHeight;
    }, 0);
    return () => clearTimeout(t);
  }, [messages.length, activeConvo?.id, mode]);

  // ---------- Load calls ----------
  useEffect(() => {
    if (commsLocked || mode !== "calls" || !activeConvo?.id) {
      setCalls([]);
      setCallsError(null);
      setLoadingCalls(false);
      return;
    }

    const controller = new AbortController();

    async function load() {
      try {
        setLoadingCalls(true);
        setCallsError(null);

        const items = await listCalls(activeConvo.id, controller.signal);
        const sorted = items
          .slice()
          .sort((a, b) => {
            const at = a.startedAt ? new Date(a.startedAt).getTime() : 0;
            const bt = b.startedAt ? new Date(b.startedAt).getTime() : 0;
            return bt - at;
          });

        setCalls(sorted);
      } catch (e: any) {
        if (isAbortError(e)) return;

        const msg = normalizeApiError(e, "Failed to load calls.");
        setCallsError(msg);
        setCalls([]);

        safeSetLockFromMessage(msg);
      } finally {
        setLoadingCalls(false);
      }
    }

    load();
    return () => controller.abort();
  }, [activeConvo?.id, mode, commsLocked]);

  async function refreshConversationsAndReselectByPhone(targetPhone: string) {
    const normalized = normalizePhone(targetPhone || "");
    if (!normalized) return null;

    try {
      const items = await listConversations();
      const sorted = sortConvos(items);

      setConvos(sorted);

      const match =
        sorted.find((c) => normalizePhone(c.phone || c.subtitle || "") === normalized) ?? null;

      if (match) setSelectedId(match.id);
      return match;
    } catch (e: any) {
      const msg = normalizeApiError(e, "We couldn’t refresh conversations.");
      setError(msg);
      safeSetLockFromMessage(msg);
      return null;
    }
  }

  useEffect(() => {
    const v = String(newTo ?? "").trim();

    // If user picked a contact, we don't keep searching unless they edit input again
    if (pickedContact) {
      const n = normalizePhone(v);
      if (n && pickedContact.phone && normalizePhone(pickedContact.phone) === n) return;
      if (v.toLowerCase() === pickedContact.name.toLowerCase()) return;
      setPickedContact(null);
    }

    if (!v) {
      setContactQuery("");
      setContactHits([]);
      setContactsError(null);
      return;
    }

    // ✅ If it's phone-y, search by digits (helps backend match phone fields)
    const q = looksLikePhoneInput(v) ? v.replace(/\D/g, "") : v;

    const t = setTimeout(() => setContactQuery(q), 220);
    return () => clearTimeout(t);
  }, [newTo, pickedContact]);

useEffect(() => {
  if (commsLocked || !hasMyNumber) return;

  const q = String(contactQuery ?? "").trim();
  if (!q) return;

  const controller = new AbortController();

  async function run() {
    try {
      setContactsLoading(true);
      setContactsError(null);

      const hits = await searchCommsContacts({ q, take: 8, signal: controller.signal });
      setContactHits(hits);
    } catch (e: any) {
      if (isAbortError(e)) return;
      setContactsError(normalizeApiError(e, "Failed to search contacts."));
    } finally {
      setContactsLoading(false);
    }
  }

  run();
  return () => controller.abort();
}, [contactQuery, commsLocked, hasMyNumber]);

  async function handleSend() {
    if (!activeConvo || commsLocked) return;

    if (!hasMyNumber) {
      setMsgsError("You need a phone number before you can send texts.");
      return;
    }

    const body = String(activeDraft || "").trim();
    if (!body) return;

    const to = normalizePhone(activeConvo.phone || activeConvo.subtitle || "");
    if (!to) {
      setMsgsError("This thread doesn’t have a destination phone number yet.");
      return;
    }

    try {
      setSending(true);
      setMsgsError(null);

      const optimistic: SmsMessage = {
        id: `optimistic-${Date.now()}`,
        conversationId: activeConvo.isDraft ? "draft" : activeConvo.id,
        direction: "OUTBOUND",
        body,
        from: null,
        to,
        status: "queued",
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, optimistic]);
      setDrafts((prev) => ({ ...prev, [activeConvo.id]: "" }));

      await sendSms({
        to,
        body,
        conversationId: activeConvo.isDraft ? null : activeConvo.id,
      });

      const match = await refreshConversationsAndReselectByPhone(to);

      if (match?.id) {
        const items = await listMessages(match.id);
        const sorted = items
          .slice()
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        setMessages(sorted);
      }
    } catch (e: any) {
      const msg = normalizeApiError(e, "Failed to send message.");
      setMsgsError(msg);
      safeSetLockFromMessage(msg);
    } finally {
      setSending(false);
    }
  }

  async function handleStartCallFor(convo: Conversation) {
    if (!convo || commsLocked) return;

    if (!hasMyNumber) {
      setCallsError("You need a phone number before you can place calls.");
      return;
    }

    const to = normalizePhone(convo.phone || convo.subtitle || "");
    if (!to) {
      setCallsError("This thread doesn’t have a destination phone number yet.");
      return;
    }

    try {
      setCallsError(null);

      await startCall({
        to,
        conversationId: convo.isDraft ? null : convo.id,
      });

      await refreshConversationsAndReselectByPhone(to);
      setMode("calls");
    } catch (e: any) {
      const msg = normalizeApiError(e, "Failed to start call.");
      setCallsError(msg);
      safeSetLockFromMessage(msg);
    }
  }

  async function handleStartCall() {
    if (!activeConvo) return;
    return handleStartCallFor(activeConvo);
  }

  function upsertConvo(list: Conversation[], convo: Conversation) {
    const next = list.filter((c) => c.id !== convo.id);
    next.unshift(convo);
    return sortConvos(next);
  }

  async function handleStartNewThread() {
    if (commsLocked) return;

    if (!hasMyNumber) {
      setError("You need a phone number before you can start a new thread.");
      return;
    }

    // If a contact is picked, prefer that phone + contactId
    const pickedPhone = pickedContact?.phone ? normalizePhone(pickedContact.phone) : null;
    const to = pickedPhone || normalizePhone(newTo);
    if (!to) return;

    // ✅ If they typed a phone number, try to auto-match a contact hit by phone
    const inferred =
      pickedContact ??
      contactHits.find((h) => normalizePhone(h.phone) === to) ??
      null;

    const contactIdToUse = inferred?.id ?? null;

    // If thread already exists, just select it (use normalized compare)
    const normalizedTo = normalizePhone(to);
    const existing =
      convos.find((c) => normalizePhone(c.phone || c.subtitle || "") === normalizedTo) ?? null;

    if (existing) {
      setSelectedId(existing.id);
      setMode("chat");
      setShowComposer(false);

      setNewTo("");
      setPickedContact(null);
      setContactHits([]);
      setContactQuery("");
      return;
    }

    try {
      setError(null);

      const convo = await createDraftConversation({
        to,
        contactId: contactIdToUse,
      });

      // ✅ Important: draft route may return an existing convo (or same threadKey) now.
      // So we upsert by id instead of blindly prepending.
      setConvos((prev) => upsertConvo(prev, convo));
      setSelectedId(convo.id);

      setNewTo("");
      setPickedContact(null);
      setContactHits([]);
      setContactQuery("");

      setMode("chat");
      setShowComposer(false);
    } catch (e: any) {
      const msg = normalizeApiError(e, "Failed to start new conversation.");
      setError(msg);
      safeSetLockFromMessage(msg);
    }
  }

  function onPickConvo(id: string) {
    setSelectedId(id);
    setMsgsError(null);
    setCallsError(null);
    setError(null);

    // ✅ Mobile: open detail immediately on tap (don’t rely on useEffect timing)
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setWorkspaceOpenMobile(true);

      // wait a tick so <main> becomes visible, then scroll + lock
      requestAnimationFrame(() => {
        scrollToWorkspace();
      });
    }
  }

  function backToList() {
    scrollBackToListHeader(() => {});
    setWorkspaceOpenMobile(false);
  }

  async function handleDeleteThread(convo: Conversation) {
    if (!convo?.id) return;
    if (commsLocked) return;

    const id = convo.id;

    const ok = window.confirm("Delete this conversation thread? This can’t be undone.");
    if (!ok) return;

    const prev = convos;

    setDeletingId(id);
    setError(null);

    setConvos((p) => p.filter((c) => c.id !== id));
    if (selectedId === id) {
      setSelectedId(null);
      setMessages([]);
      setCalls([]);
      setMsgsError(null);
      setCallsError(null);
    }

    try {
      const res = await fetch(`/api/sms/conversations/${id}`, { method: "DELETE" });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        const msg = text?.trim()
          ? text.trim().slice(0, 300)
          : `Failed to delete conversation (${res.status}).`;
        setConvos(prev);
        setError(msg);
      }
    } catch (e: any) {
      const msg = normalizeApiError(e, "Failed to delete conversation.");
      setConvos(prev);
      setError(msg);
    } finally {
      setDeletingId(null);
    }
  }

  const headerTitle = "Messages";
  const headerSubtitle = commsLocked
    ? "Locked"
    : loadingMyNumber
      ? "Loading number…"
      : hasMyNumber
        ? `From: ${myNumber?.e164}`
        : "No number";

  const activeIsDraft = !!activeConvo?.isDraft;

  return (
    <>
      <div className="space-y-8">
        <PageHeader
          eyebrow="Comms"
          title="Conversations"
          subtitle="Text and call — fast, private, organized."
        />
      </div>
      <section className="mx-auto w-full max-w-6xl">
        {/* Window: make it reliably height-managed + scroll-safe */}
        <div
          className={cx(
            "overflow-hidden rounded-[26px] border border-slate-800/70 bg-slate-950/65 shadow-[0_0_60px_rgba(0,0,0,0.55)] backdrop-blur-xl",
            "flex flex-col min-h-[640px]",
            // Uses dynamic viewport height on mobile to avoid Safari URL-bar jumpiness
            "h-[min(820px,calc(100dvh-160px))] lg:h-[min(860px,calc(100dvh-140px))]"
          )}
        >
          {/* Top chrome */}
          <div className="shrink-0 flex items-center justify-between gap-3 border-b border-slate-800/60 bg-slate-950/70 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-slate-50">{headerTitle}</p>
              <p className="truncate text-[11px] text-[var(--avillo-cream-muted)]">{headerSubtitle}</p>
            </div>

            <div className="flex items-center gap-2">
              <PillTabs
                value={mode}
                onChange={setMode}
                disabled={commsLocked}
                options={[
                  { value: "chat", label: "Chat" },
                  { value: "calls", label: "Calls" },
                ]}
              />

              <IconButton
                label="New message"
                onClick={() => setShowComposer((v) => !v)}
                disabled={commsLocked || !hasMyNumber}
              >
                ✎
              </IconButton>
            </div>
          </div>

          {/* Lock banner */}
          {commsLocked && (
            <div className="shrink-0 border-b border-amber-200/20 bg-amber-500/10 px-4 py-3">
              <p className="text-[11px] font-semibold text-amber-100">Comms locked</p>
              <p className="mt-1 text-[11px] text-[var(--avillo-cream-soft)]">
                {commsLockMsg || "Comms requires a Pro plan (or Beta access)."}
              </p>
            </div>
          )}

          {/* Body (must be min-h-0 so children can scroll) */}
          <div className="min-h-0 flex-1 grid lg:grid-cols-[340px_1fr]">
            {/* Sidebar */}
            <aside
              ref={listHeaderRef}
              className={cx(
                "min-h-0 border-r border-slate-800/60 bg-slate-950/55",
                "flex flex-col",
                workspaceOpenMobile ? "hidden" : "flex",
                "lg:flex"
              )}
            >
              {/* Sidebar header (shrink-0) */}
              <div className="shrink-0 border-b border-slate-800/60 px-3 py-3">
                {!commsLocked && (
                  <div className="mb-3">
                    {!hasMyNumber ? (
                      <div className="rounded-2xl border border-slate-800/70 bg-slate-950/60 p-3
                      shadow-[inset_0_0_45px_rgba(251,191,36,0.12)]">
                        <p className="text-[12px] font-semibold text-slate-50">Activate your work number.</p>
                        <p className="mt-0.5 text-[11px] text-[var(--avillo-cream-muted)]">
                          Choose your area code — we’ll take care of the rest.
                        </p>

                        {myNumberError && (
                          <div className="mt-2 rounded-xl border border-rose-400/50 bg-rose-950/35 px-3 py-2 text-[11px] text-rose-50">
                            {myNumberError}
                          </div>
                        )}

                        <div className="mt-2 flex items-center gap-2">
                          <input
                            value={areaCode}
                            onChange={(e) => setAreaCode(e.target.value)}
                            placeholder="Area code (optional)"
                            className="w-full rounded-xl border border-slate-800/70 bg-slate-950/70 px-3 py-2 text-[12px] text-slate-50 outline-none placeholder:text-[var(--avillo-cream-muted)] focus:border-amber-200/40 disabled:opacity-60"
                            disabled={loadingMyNumber || provisioningNumber}
                          />
                          <button
                            type="button"
                            onClick={handleProvisionMyNumber}
                            disabled={loadingMyNumber || provisioningNumber}
                            className="shrink-0 rounded-xl border border-amber-100/50 bg-amber-50/10 px-3 py-2 text-[12px] font-semibold text-amber-50 hover:bg-amber-50/15 disabled:opacity-60"
                          >
                            {provisioningNumber ? "…" : "Get"}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}

                {/* Search */}
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-[var(--avillo-cream-muted)]">
                    ⌕
                  </span>
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search"
                    className="w-full rounded-2xl border border-slate-800/70 bg-slate-950/65 py-2 pl-8 pr-3 text-[12px] text-slate-50 outline-none placeholder:text-[var(--avillo-cream-muted)] focus:border-slate-600/60 disabled:opacity-60"
                    disabled={commsLocked}
                  />
                </div>

                {/* Compose drawer */}
                {!commsLocked && hasMyNumber && showComposer && (
                <div className="mt-3 rounded-2xl border border-slate-800/70 bg-slate-950/60 p-3">
                  <p className="text-[11px] font-semibold text-slate-50">New message</p>
                  <p className="mt-0.5 text-[11px] text-[var(--avillo-cream-muted)]">
                    Type a contact name or a phone number.
                  </p>

                  <div className="mt-2 relative">
                    <div className="flex items-center gap-2">
                      <input
                        value={newTo}
                        onChange={(e) => {
                          setNewTo(e.target.value);
                          setContactsError(null);
                          // If they start typing again, allow switching away from a previously picked contact
                          // (your debounce effect will also clear pickedContact if it no longer matches)
                        }}
                        placeholder="To: name or +1…"
                        className="w-full rounded-xl border border-slate-800/70 bg-slate-950/70 px-3 py-2 text-[12px] text-slate-50 outline-none placeholder:text-[var(--avillo-cream-muted)] focus:border-slate-600/60 disabled:opacity-60"
                        disabled={!hasMyNumber}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleStartNewThread();
                          if (e.key === "Escape") {
                            setContactHits([]);
                            setContactQuery("");
                          }
                        }}
                      />

                      <button
                        type="button"
                        onClick={handleStartNewThread}
                        disabled={!hasMyNumber || (!normalizePhone(newTo) && !pickedContact)}
                        className="shrink-0 rounded-xl border border-slate-700/70 bg-slate-900/50 px-3 py-2 text-[12px] font-semibold text-slate-50 hover:bg-slate-900/70 disabled:opacity-50"
                      >
                        Send
                      </button>
                    </div>

                    {/* Contact dropdown (only when input does NOT look like a phone number) */}
                    {(contactsLoading || contactsError || contactHits.length > 0 || String(contactQuery ?? "").trim()) && (
                        <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-2xl border border-slate-800/70 bg-slate-950/95 shadow-[0_20px_50px_rgba(0,0,0,0.45)]">
                          {contactsLoading && (
                            <div className="px-3 py-2 text-[11px] text-[var(--avillo-cream-muted)]">
                              Searching…
                            </div>
                          )}

                          {contactsError && !contactsLoading && (
                            <div className="px-3 py-2 text-[11px] text-rose-200/90">
                              {contactsError}
                            </div>
                          )}

                          {!contactsLoading &&
                            !contactsError &&
                            contactHits.slice(0, 8).map((h) => (
                              <button
                                key={h.id}
                                type="button"
                                onClick={() => {
                                  setPickedContact(h);

                                  // simplest UX: after pick, put their phone in the input so Send works instantly
                                  setNewTo(h.phone);

                                  // close dropdown
                                  setContactHits([]);
                                  setContactQuery("");
                                  setContactsError(null);
                                }}
                                className="w-full px-3 py-2 text-left hover:bg-slate-900/60"
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="truncate text-[12px] font-semibold text-slate-50">
                                      {h.name}
                                    </p>
                                    <p className="truncate text-[11px] text-[var(--avillo-cream-muted)]">
                                      {h.phone}
                                    </p>
                                  </div>

                                  <span className="shrink-0 rounded-full border border-slate-800/70 bg-slate-950/60 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--avillo-cream-muted)]">
                                    {String(h.relationshipType ?? "").toLowerCase() || "contact"}
                                  </span>
                                </div>
                              </button>
                            ))}

                          {!contactsLoading &&
                            !contactsError &&
                            contactHits.length === 0 &&
                            String(contactQuery ?? "").trim() && (
                              <div className="px-3 py-2 text-[11px] text-[var(--avillo-cream-muted)]">
                                No matches.
                              </div>
                            )}
                        </div>
                      )}
                  </div>
                </div>
              )}

              {error && !commsLocked && (
                <div className="mt-3 rounded-2xl border border-rose-400/50 bg-rose-950/35 px-3 py-2 text-[11px] text-rose-50">
                  {error}
                </div>
              )}
              </div>

              {/* Conversation list (flex-1 scroll) */}
              <div ref={listScrollRef} className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
                {loadingConvos && (
                  <div className="py-10 text-center text-[11px] text-[var(--avillo-cream-muted)]">
                    Loading…
                  </div>
                )}

                {!loadingConvos && filteredConvos.length === 0 && (
                  <div className="py-10 text-center text-[11px] text-[var(--avillo-cream-muted)]">
                    No conversations.
                  </div>
                )}

                {!loadingConvos &&
                  filteredConvos.map((c) => {
                    const isSelected = c.id === selectedId;
                    const deleting = deletingId === c.id;

                    return (
                      <button
                        key={c.id}
                        type="button"
                        data-convo-id={c.id}
                        onClick={() => onPickConvo(c.id)}
                        disabled={commsLocked}
                        className={cx(
                          "group w-full rounded-2xl px-3 py-3 text-left transition-colors",
                          isSelected
                            ? "bg-slate-900/70 ring-1 ring-slate-700/70"
                            : "hover:bg-slate-900/45",
                          commsLocked ? "opacity-60 cursor-not-allowed" : ""
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <div
                              className={cx(
                                "flex h-10 w-10 items-center justify-center rounded-full border text-[11px] font-semibold",
                                isSelected
                                  ? "border-slate-600/70 bg-slate-950/60 text-slate-50"
                                  : "border-slate-800/70 bg-slate-950/60 text-slate-50"
                              )}
                            >
                              {initials(c.title || "U")}
                            </div>
                            {typeof c.unreadCount === "number" && c.unreadCount > 0 ? (
                              <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-amber-500/90 px-1.5 text-[10px] font-semibold text-slate-950">
                                {c.unreadCount > 99 ? "99+" : c.unreadCount}
                              </span>
                            ) : null}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <p className="truncate text-[12px] font-semibold text-slate-50">
                                {c.title || "Unknown"}
                              </p>

                              <p className="shrink-0 text-[10px] leading-none tabular-nums text-[var(--avillo-cream-muted)]">
                                {formatListTimestamp(c.lastMessageAt)}
                              </p>
                            </div>

                            <p className="mt-0.5 truncate text-[11px] text-[var(--avillo-cream-muted)]">
                              {(() => {
                                const fromApi = String(c.lastMessagePreview ?? "").trim();

                                const draftPreview = String(drafts[c.id] ?? "").trim();
                                
                                const raw = fromApi || draftPreview || (c.isDraft ? "New conversation" : "");
                                return clampPreview(raw, PREVIEW_MAX_CHARS);
                              })()}
                            </p>
                          </div>

                          {/* Hover actions */}
                          <div className="flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                            <IconButton
                              label="Call"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                onPickConvo(c.id);
                                setTimeout(() => void handleStartCallFor(c), 0);
                              }}
                              disabled={actionsDisabled || deleting}
                            >
                              ☎︎
                            </IconButton>

                            <DangerIconButton
                              label="Delete thread"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                void handleDeleteThread(c);
                              }}
                              disabled={commsLocked || deleting}
                            >
                              {deleting ? "…" : "🗑"}
                            </DangerIconButton>
                          </div>
                        </div>
                      </button>
                    );
                  })}
              </div>
            </aside>

            {/* Main panel */}
            <main
              ref={workspaceRef as any}
              className={cx(
                "min-h-0 bg-slate-950/35",
                "flex flex-col",
                workspaceOpenMobile ? "flex" : "hidden",
                "lg:flex"
              )}
            >
              {/* Main header */}
              <div className="shrink-0 flex items-center justify-between gap-3 border-b border-slate-800/60 bg-slate-950/45 px-4 py-3">
                <div className="min-w-0">
                  {activeConvo ? (
                    <>
                      <p className="truncate text-[13px] font-semibold text-slate-50">
                        {activeConvo.title || "Unknown"}
                      </p>
                      <p className="truncate text-[11px] text-[var(--avillo-cream-muted)]">
                        {shortPhone(activeConvo.phone || activeConvo.subtitle) || "No number"}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-[13px] font-semibold text-slate-50">Select a conversation</p>
                      <p className="text-[11px] text-[var(--avillo-cream-muted)]">
                        Choose a thread on the left.
                      </p>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={backToList}
                    className="lg:hidden rounded-xl border border-slate-800/70 bg-slate-950/55 px-3 py-1.5 text-[12px] font-semibold text-[var(--avillo-cream-soft)] hover:bg-slate-900/55"
                  >
                    Back
                  </button>

                  <IconButton
                    label="Call"
                    onClick={handleStartCall}
                    disabled={!activeConvo || actionsDisabled}
                  >
                    ☎︎
                  </IconButton>
                </div>
              </div>

              {/* Content (fills height; child components handle their own scroll) */}
              <div className="min-h-0 flex-1 p-4">
                {!activeConvo ? (
                  <EmptyState />
                ) : mode === "chat" ? (
                  <ThreadApple
                    scrollRef={threadScrollRef}
                    isLocal={activeIsDraft}
                    loading={loadingMsgs}
                    error={msgsError}
                    messages={messages}
                    draft={activeDraft}
                    sending={sending}
                    disabled={actionsDisabled}
                    onDraftChange={(v) => setDrafts((prev) => ({ ...prev, [activeConvo.id]: v }))}
                    onSend={handleSend}
                  />
                ) : (
                  <CallsApple
                    isLocal={activeIsDraft}
                    loading={loadingCalls}
                    error={callsError}
                    calls={calls}
                    disabled={actionsDisabled}
                    onStartCall={handleStartCall}
                  />
                )}
              </div>
            </main>
          </div>
        </div>
      </section>
    </>
  );
}

/* -----------------------------
 * Apple-ish UI bits
 * ----------------------------*/

function EmptyState() {
  return (
    <div className="flex h-full min-h-[420px] flex-col items-center justify-center text-center">
      <div className="rounded-3xl border border-slate-800/60 bg-slate-950/45 px-6 py-5 shadow-[0_0_40px_rgba(0,0,0,0.25)]">
        <p className="text-[13px] font-semibold text-slate-50">Ready when you are!</p>
        <p className="mt-1 max-w-sm text-[12px] text-[var(--avillo-cream-muted)]">
          Pick a thread — or switch to Calls for history.
        </p>
      </div>
    </div>
  );
}

function PillTabs({
  value,
  onChange,
  disabled,
  options,
}: {
  value: string;
  onChange: (v: any) => void;
  disabled?: boolean;
  options: { value: string; label: string }[];
}) {
  return (
    <div
      className={cx(
        "inline-flex overflow-hidden rounded-full border border-slate-800/70 bg-slate-950/55 p-0.5",
        disabled ? "opacity-60 cursor-not-allowed" : ""
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            disabled={disabled}
            className={cx(
              "px-3 py-1.5 text-[12px] font-semibold transition-colors",
              active
                ? "rounded-full bg-slate-900/80 text-slate-50"
                : "text-[var(--avillo-cream-muted)] hover:text-slate-50"
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function IconButton({
  label,
  onClick,
  children,
  disabled,
}: {
  label: string;
  onClick?: (e?: any) => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={cx(
        "inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-800/70 bg-slate-950/55 text-[13px] text-[var(--avillo-cream-soft)]",
        disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-slate-900/55 hover:border-slate-700/70"
      )}
    >
      {children}
    </button>
  );
}

function DangerIconButton({
  label,
  onClick,
  children,
  disabled,
}: {
  label: string;
  onClick?: (e?: any) => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={cx(
        "inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-800/70 bg-slate-950/55 text-[13px] text-rose-200/90",
        disabled
          ? "opacity-50 cursor-not-allowed"
          : "hover:bg-rose-500/10 hover:border-rose-300/40 hover:text-rose-200"
      )}
    >
      {children}
    </button>
  );
}

function ThreadApple({
  scrollRef,
  isLocal,
  loading,
  error,
  messages,
  draft,
  sending,
  disabled,
  onDraftChange,
  onSend,
}: {
  scrollRef: React.RefObject<HTMLDivElement>;
  isLocal: boolean;
  loading: boolean;
  error: string | null;
  messages: SmsMessage[];
  draft: string;
  sending: boolean;
  disabled: boolean;
  onDraftChange: (v: string) => void;
  onSend: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  function autosizeComposer() {
    const el = textareaRef.current;
    if (!el) return;

    const cs = window.getComputedStyle(el);
    const lineHeight = Number.parseFloat(cs.lineHeight || "20") || 20;

    const maxLines = 6;
    const maxHeight = Math.ceil(lineHeight * maxLines);

    el.style.height = "auto";
    const next = Math.min(el.scrollHeight, maxHeight);
    el.style.height = `${next}px`;

    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    autosizeComposer();
  }, [draft]);

  return (
    // ✅ Make the whole card height-aware and let ONLY the middle section scroll
    <div className="h-full min-h-0 rounded-[26px] border border-slate-800/60 bg-slate-950/45 shadow-[0_0_40px_rgba(0,0,0,0.25)] flex flex-col">
      {(error || isLocal) && (
        <div className="shrink-0 border-b border-slate-800/60 px-4 py-3">
          {error && (
            <div className="rounded-2xl border border-rose-400/50 bg-rose-950/35 px-3 py-2 text-[12px] text-rose-50">
              {error}
            </div>
          )}
          {isLocal && !error && (
            <div className="rounded-2xl border border-amber-200/25 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-50">
              Draft thread — send the first text to create it.
            </div>
          )}
        </div>
      )}

      {/* ✅ Scroll region: min-h-0 + flex-1 is the whole trick */}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-4 overscroll-contain"
      >
        {loading && (
          <div className="py-16 text-center text-[12px] text-[var(--avillo-cream-muted)]">
            Loading…
          </div>
        )}

        {!loading && messages.length === 0 && (
          <div className="py-16 text-center text-[12px] text-[var(--avillo-cream-muted)]">
            No messages yet.
          </div>
        )}

        {!loading &&
          messages.map((m) => {
            const outbound = m.direction === "OUTBOUND";

            return (
              <div
                key={m.id}
                className={cx(
                  "mb-2 flex w-full",
                  outbound ? "justify-end" : "justify-start"
                )}
              >
                <div
                  className={cx(
                    "max-w-[78%] flex flex-col",
                    outbound ? "items-end" : "items-start"
                  )}
                >
                  <div
                    className={cx(
                      "inline-flex w-fit rounded-[22px] px-4 py-2 text-[13px] leading-snug text-left",
                      outbound
                        ? "bg-blue-500/90 text-white"
                        : "bg-slate-900/70 text-slate-50 border border-slate-800/60"
                    )}
                  >
                    <p className="whitespace-pre-wrap break-words">
                      {m.body}
                    </p>
                  </div>

                  <div
                    className={cx(
                      "mt-1 text-[10px] text-[var(--avillo-cream-muted)]",
                      outbound ? "text-right pr-1" : "pl-1"
                    )}
                  >
                    {formatWhen(m.createdAt)}
                  </div>
                </div>
              </div>
            );
          })}
      </div>

      {/* ✅ Composer stays pinned; no scrolling here */}
      <div className="shrink-0 border-t border-slate-800/60 px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
        <div className="flex items-center gap-2">
          <div className="flex-1 rounded-[20px] border border-slate-800/70 bg-slate-950/60 px-3 py-2 min-h-[44px] flex">
            <textarea
              ref={textareaRef}
              rows={1}
              value={draft}
              onChange={(e) => {
                onDraftChange(e.target.value);
                requestAnimationFrame(() => autosizeComposer());
              }}
              placeholder="Message…"
              disabled={disabled}
              className="w-full resize-none bg-transparent text-[13px] leading-[20px] text-slate-50 outline-none placeholder:text-[var(--avillo-cream-muted)] disabled:opacity-60"
              style={{ overflowY: "hidden" }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onSend();
                }
              }}
            />
          </div>

          <button
            type="button"
            onClick={onSend}
            disabled={disabled || !draft.trim()}
            className={cx(
              "h-10 rounded-full px-4 text-[12px] font-semibold",
              disabled || !draft.trim()
                ? "border border-slate-800/70 bg-slate-950/40 text-[var(--avillo-cream-muted)] opacity-70"
                : "border border-slate-200/60 bg-slate-50 text-slate-950 hover:bg-slate-100"
            )}
            title="Send (Ctrl/⌘ + Enter)"
          >
            {sending ? "…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CallsApple({
  isLocal,
  loading,
  error,
  calls,
  disabled,
  onStartCall,
}: {
  isLocal: boolean;
  loading: boolean;
  error: string | null;
  calls: CallItem[];
  disabled: boolean;
  onStartCall: () => void;
}) {
  return (
    // ✅ Same structure: header(s) pinned, list scrolls
    <div className="h-full min-h-0 rounded-[26px] border border-slate-800/60 bg-slate-950/45 shadow-[0_0_40px_rgba(0,0,0,0.25)] flex flex-col">
      {(error || isLocal) && (
        <div className="shrink-0 border-b border-slate-800/60 px-4 py-3">
          {error && (
            <div className="rounded-2xl border border-rose-400/50 bg-rose-950/35 px-3 py-2 text-[12px] text-rose-50">
              {error}
            </div>
          )}
          {isLocal && !error && (
            <div className="rounded-2xl border border-amber-200/25 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-50">
              Draft thread — place the first call to create it.
            </div>
          )}
        </div>
      )}

      <div className="shrink-0 flex items-center justify-between border-b border-slate-800/60 px-4 py-3">
        <p className="text-[13px] font-semibold text-slate-50">Calls</p>
        <button
          type="button"
          onClick={onStartCall}
          disabled={disabled}
          className={cx(
            "rounded-full px-4 py-2 text-[12px] font-semibold",
            disabled
              ? "border border-slate-800/70 bg-slate-950/40 text-[var(--avillo-cream-muted)] opacity-70"
              : "border border-emerald-200/30 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/15"
          )}
        >
          Call
        </button>
      </div>

      {/* ✅ Scroll region */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 overscroll-contain">
        {loading && (
          <div className="py-16 text-center text-[12px] text-[var(--avillo-cream-muted)]">
            Loading…
          </div>
        )}

        {!loading && calls.length === 0 && (
          <div className="py-16 text-center text-[12px] text-[var(--avillo-cream-muted)]">
            No calls yet.
          </div>
        )}

        {!loading &&
          calls.slice(0, 100).map((c) => {
            const dir = c.direction === "INBOUND" ? "Inbound" : "Outbound";
            const status = String(c.status || "logged").toLowerCase();
            const when = formatWhen(c.startedAt || c.createdAt || null);

            return (
              <div
                key={c.id}
                className="mb-2 rounded-2xl border border-slate-800/60 bg-slate-950/55 px-4 py-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[13px] font-semibold text-slate-50">{dir} call</p>
                  <span className="text-[11px] text-[var(--avillo-cream-muted)]">{when}</span>
                </div>
                <p className="mt-1 text-[12px] text-[var(--avillo-cream-muted)]">{status}</p>
              </div>
            );
          })}
      </div>
    </div>
  );
}
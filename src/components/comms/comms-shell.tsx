// src/components/comms/comms-shell.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useCrmMobileWorkspaceScroll } from "@/hooks/useCrmMobileWorkspaceScroll";
import { avilloTabPillClass } from "@/components/ui/tabPills";

import type { CallItem, Conversation, SmsMessage } from "./comms-types";
import {
  listCalls,
  listConversations,
  listMessages,
  sendSms,
  startCall,
  getMyNumber,
  provisionMyNumber,
  type MyNumber,
} from "./api";
import { cx, formatWhen, initials, normalizePhone } from "./comms-utils";

type DraftMap = Record<string, string>;
type CommsMode = "calls" | "chat";
type RightTab = "activity" | "thread" | "info";

function isAbortError(err: any) {
  return (
    err?.name === "AbortError" ||
    err?.code === "ABORT_ERR" ||
    String(err?.message ?? "").toLowerCase().includes("aborted")
  );
}

/**
 * Backend enforces:
 * - conversationId must exist and belong to user
 * So local placeholder ids must NEVER be used for:
 * - listMessages / listCalls
 * - sendSms / startCall (pass conversationId only when real)
 */
function isLocalConvoId(id?: string | null) {
  return !!id && String(id).startsWith("local-");
}

function looksLikeEntitlementError(msg?: string | null) {
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
 * Some API errors come back as full HTML (Next error page / auth redirect).
 * Never surface that in UI — show a human fallback instead.
 */
function normalizeApiError(e: any, fallback: string) {
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

  // prevent massive blobs from blowing up layout
  if (msg.length > 500) return msg.slice(0, 500) + "…";
  return msg;
}

export default function CommsShell() {
  const { listHeaderRef, workspaceRef, scrollToWorkspace, scrollBackToListHeader } =
    useCrmMobileWorkspaceScroll();

  const listScrollRef = useRef<HTMLDivElement | null>(null);

  const isMobile = () => typeof window !== "undefined" && window.innerWidth < 1024;

  // Layout
  const [workspaceOpenMobile, setWorkspaceOpenMobile] = useState(false);

  // Mode pills
  const [mode, setMode] = useState<CommsMode>("calls");

  // Search + selection
  const [search, setSearch] = useState("");
  const [loadingConvos, setLoadingConvos] = useState(true);
  const [convos, setConvos] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeConvo, setActiveConvo] = useState<Conversation | null>(null);

  // Workspace tabs
  const [rightTab, setRightTab] = useState<RightTab>("activity");

  // Messages
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [msgsError, setMsgsError] = useState<string | null>(null);
  const [messages, setMessages] = useState<SmsMessage[]>([]);
  const [drafts, setDrafts] = useState<DraftMap>({});
  const [sending, setSending] = useState(false);

  // Calls
  const [loadingCalls, setLoadingCalls] = useState(false);
  const [callsError, setCallsError] = useState<string | null>(null);
  const [calls, setCalls] = useState<CallItem[]>([]);

  const [error, setError] = useState<string | null>(null);

  // Hard UI gate derived from API errors (no extra endpoint needed)
  const [commsLocked, setCommsLocked] = useState(false);
  const [commsLockMsg, setCommsLockMsg] = useState<string | null>(null);

  // Phone number (Twilio) onboarding
  const [myNumber, setMyNumber] = useState<MyNumber | null>(null);
  const [loadingMyNumber, setLoadingMyNumber] = useState(true);
  const [myNumberError, setMyNumberError] = useState<string | null>(null);
  const [areaCode, setAreaCode] = useState("");
  const [provisioningNumber, setProvisioningNumber] = useState(false);

  const hasMyNumber = !!myNumber?.e164;
  const needsNumber = !commsLocked && !loadingMyNumber && !hasMyNumber;

  // Quick start by number
  const [newTo, setNewTo] = useState("");

  const activeDraft = activeConvo?.id ? drafts[activeConvo.id] ?? "" : "";

  const activeIsLocal = isLocalConvoId(activeConvo?.id);
  const actionsDisabled = commsLocked || sending || !hasMyNumber;

  function clearSelection() {
    setSelectedId(null);
    setActiveConvo(null);
    setWorkspaceOpenMobile(false);
    setMsgsError(null);
    setCallsError(null);
    setMessages([]);
    setCalls([]);
  }

  function backToListAndClearSelection() {
    setWorkspaceOpenMobile(false);
    scrollBackToListHeader(() => clearSelection());
  }

  // Mode defaults
  useEffect(() => {
    setRightTab(mode === "calls" ? "activity" : "thread");
    setMsgsError(null);
    setCallsError(null);
    setMessages([]);
    setCalls([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // ---------- Load my number ----------
  useEffect(() => {
    const controller = new AbortController();

    async function loadMyNumber() {
      try {
        setLoadingMyNumber(true);
        setMyNumberError(null);

        const n = await getMyNumber(controller.signal);
        setMyNumber(n);
      } catch (e: any) {
        if (isAbortError(e)) return;

        const msg = normalizeApiError(e, "We couldn’t load your phone number.");
        setMyNumberError(msg);

        if (looksLikeEntitlementError(msg)) {
          setCommsLocked(true);
          setCommsLockMsg(msg);
        }
      } finally {
        setLoadingMyNumber(false);
      }
    }

    loadMyNumber();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleProvisionMyNumber() {
    if (commsLocked) return;

    const acRaw = areaCode.trim();
    const ac = acRaw ? acRaw.replace(/\D/g, "").slice(0, 3) : "";

    try {
      setProvisioningNumber(true);
      setMyNumberError(null);

      await provisionMyNumber({ areaCode: ac || null });

      // Refresh
      const n = await getMyNumber();
      setMyNumber(n);
    } catch (e: any) {
      const msg = normalizeApiError(e, "We couldn’t provision a number. Please try again.");
      setMyNumberError(msg);

      if (looksLikeEntitlementError(msg)) {
        setCommsLocked(true);
        setCommsLockMsg(msg);
      }
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

        // If we successfully fetch, clear any previous lock
        setCommsLocked(false);
        setCommsLockMsg(null);

        const sorted = items
          .slice()
          .sort((a, b) => {
            const at = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
            const bt = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
            return bt - at;
          });

        setConvos(sorted);

        if (selectedId) {
          const still = sorted.find((c) => c.id === selectedId) ?? null;
          setActiveConvo(still);
          if (!still) setSelectedId(null);
        }
      } catch (e: any) {
        if (isAbortError(e)) return;

        const msg = e?.message || "We couldn’t load your conversations.";
        setError(msg);
        setConvos([]);
        setSelectedId(null);
        setActiveConvo(null);

        // If this is entitlement gating, lock the whole Comms UI
        if (looksLikeEntitlementError(msg)) {
          setCommsLocked(true);
          setCommsLockMsg(msg);
        }
      } finally {
        setLoadingConvos(false);
      }
    }

    load();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- Filtered list ----------
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

  // Keep activeConvo in sync when selection changes
  useEffect(() => {
    if (!selectedId) {
      setActiveConvo(null);
      return;
    }
    const found = convos.find((c) => c.id === selectedId) ?? null;
    setActiveConvo(found);
  }, [selectedId, convos]);

  // Mobile: when selected, show workspace
  useEffect(() => {
    if (!isMobile()) {
      setWorkspaceOpenMobile(false);
      return;
    }
    if (!activeConvo) {
      setWorkspaceOpenMobile(false);
      return;
    }
    setWorkspaceOpenMobile(true);
    scrollToWorkspace();
  }, [activeConvo?.id, scrollToWorkspace]);

  // Desktop: keep selected in view
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

  // Switching threads: keep right side aligned with mode
  useEffect(() => {
    if (!activeConvo?.id) return;
    setRightTab(mode === "calls" ? "activity" : "thread");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConvo?.id]);

  // ---------- Load messages ----------
  useEffect(() => {
    // hard stop if locked
    if (commsLocked) {
      setMessages([]);
      setMsgsError(null);
      setLoadingMsgs(false);
      return;
    }

    if (!activeConvo?.id) {
      setMessages([]);
      setMsgsError(null);
      setLoadingMsgs(false);
      return;
    }

    // Local thread has no server messages yet
    if (isLocalConvoId(activeConvo.id)) {
      setMessages([]);
      setMsgsError(null);
      setLoadingMsgs(false);
      return;
    }

    if (mode !== "chat" || rightTab !== "thread") {
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
        const sorted = items
          .slice()
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        setMessages(sorted);
      } catch (e: any) {
        if (isAbortError(e)) return;

        const msg = e?.message || "Failed to load messages.";
        setMsgsError(msg);
        setMessages([]);

        if (looksLikeEntitlementError(msg)) {
          setCommsLocked(true);
          setCommsLockMsg(msg);
        }
      } finally {
        setLoadingMsgs(false);
      }
    }

    load();
    return () => controller.abort();
  }, [activeConvo?.id, mode, rightTab, commsLocked]);

  // ---------- Load calls ----------
  useEffect(() => {
    if (commsLocked) {
      setCalls([]);
      setCallsError(null);
      setLoadingCalls(false);
      return;
    }

    if (!activeConvo?.id) {
      setCalls([]);
      setCallsError(null);
      setLoadingCalls(false);
      return;
    }

    // Local thread has no calls yet
    if (isLocalConvoId(activeConvo.id)) {
      setCalls([]);
      setCallsError(null);
      setLoadingCalls(false);
      return;
    }

    if (mode !== "calls" || rightTab !== "activity") {
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

        const msg = e?.message || "Failed to load calls.";
        setCallsError(msg);
        setCalls([]);

        if (looksLikeEntitlementError(msg)) {
          setCommsLocked(true);
          setCommsLockMsg(msg);
        }
      } finally {
        setLoadingCalls(false);
      }
    }

    load();
    return () => controller.abort();
  }, [activeConvo?.id, mode, rightTab, commsLocked]);

  async function refreshConversationsAndReselectByPhone(targetPhone: string) {
    const controller = new AbortController();
    const items = await listConversations(controller.signal);

    const sorted = items
      .slice()
      .sort((a, b) => {
        const at = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
        const bt = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
        return bt - at;
      });

    setConvos(sorted);

    const match =
      sorted.find((c) => normalizePhone(c.phone || c.subtitle || "") === targetPhone) ?? null;

    if (match) {
      setSelectedId(match.id);
      setActiveConvo(match);
    }

    return match;
  }

  async function handleSend() {
    if (!activeConvo) return;
    if (commsLocked) return;

    if (!hasMyNumber) {
      setMsgsError("You need a phone number before you can send texts. Click “Get my number” above.");
      return;
    }

    const body = String(activeDraft || "").trim();
    if (!body) return;

    const to = normalizePhone(activeConvo.phone || activeConvo.subtitle || "");
    if (!to) {
      setMsgsError("This conversation doesn’t have a destination phone number yet.");
      return;
    }

    try {
      setSending(true);
      setMsgsError(null);

      const optimistic: SmsMessage = {
        id: `optimistic-${Date.now()}`,
        conversationId: activeConvo.id,
        direction: "OUTBOUND",
        body,
        from: null,
        to,
        status: "queued",
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, optimistic]);
      setDrafts((prev) => ({ ...prev, [activeConvo.id]: "" }));

      // ✅ IMPORTANT:
      // If this is a local placeholder convo, do NOT pass conversationId.
      // Server will upsert conversation by (phoneNumberId + contactId + otherPartyE164).
      await sendSms({
        to,
        body,
        conversationId: activeIsLocal ? null : activeConvo.id,
      });

      // After send, refresh inbox & jump to the REAL conversation row
      const match = await refreshConversationsAndReselectByPhone(to);

      // If we now have a real convo selected, reload its messages (listMessages requires real id)
      if (match?.id && !isLocalConvoId(match.id)) {
        const items = await listMessages(match.id);
        const sorted = items
          .slice()
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        setMessages(sorted);
      }
    } catch (e: any) {
      const msg = e?.message || "Failed to send message.";
      setMsgsError(msg);

      if (looksLikeEntitlementError(msg)) {
        setCommsLocked(true);
        setCommsLockMsg(msg);
      }
    } finally {
      setSending(false);
    }
  }

  async function handleStartCallFor(convo: Conversation) {
    if (!convo) return;
    if (commsLocked) return;

    if (!hasMyNumber) {
      setCallsError("You need a phone number before you can place calls. Click “Get my number” above.");
      return;
    }

    const to = normalizePhone(convo.phone || convo.subtitle || "");
    if (!to) {
      setCallsError("This conversation doesn’t have a destination phone number yet.");
      return;
    }

    try {
      setCallsError(null);

      const isLocal = isLocalConvoId(convo.id);

      // ✅ IMPORTANT: If local placeholder convo, do NOT pass conversationId.
      await startCall({
        to,
        conversationId: isLocal ? null : convo.id,
      });

      await refreshConversationsAndReselectByPhone(to);

      setMode("calls");
      setRightTab("activity");
    } catch (e: any) {
      const msg = e?.message || "Failed to start call.";
      setCallsError(msg);

      if (looksLikeEntitlementError(msg)) {
        setCommsLocked(true);
        setCommsLockMsg(msg);
      }
    }
  }

  async function handleStartCall() {
    if (!activeConvo) return;
    if (commsLocked) return;

    if (!hasMyNumber) {
      setCallsError("You need a phone number before you can place calls. Click “Get my number” above.");
      return;
    }

    const to = normalizePhone(activeConvo.phone || activeConvo.subtitle || "");
    if (!to) {
      setCallsError("This conversation doesn’t have a destination phone number yet.");
      return;
    }

    try {
      setCallsError(null);

      // ✅ IMPORTANT:
      // If local placeholder convo, do NOT pass conversationId.
      await startCall({
        to,
        conversationId: activeIsLocal ? null : activeConvo.id,
      });

      // After start, refresh and jump to real convo (if it got created)
      await refreshConversationsAndReselectByPhone(to);

      setMode("calls");
      setRightTab("activity");
    } catch (e: any) {
      const msg = e?.message || "Failed to start call.";
      setCallsError(msg);

      if (looksLikeEntitlementError(msg)) {
        setCommsLocked(true);
        setCommsLockMsg(msg);
      }
    }
  }

  function handleStartNewThread() {
    if (commsLocked) return;

    if (!hasMyNumber) {
      setError("You need a phone number before you can start a new thread. Click “Get my number” above.");
      return;
    }

    const to = normalizePhone(newTo);
    if (!to) return;

    const found = convos.find((c) => normalizePhone(c.phone || c.subtitle || "") === to);
    if (found) {
      setSelectedId(found.id);
      setNewTo("");
      return;
    }

    // ✅ Local placeholder (no server resources yet)
    const localId = `local-${to}`;
    const local: Conversation = {
      id: localId,
      title: to,
      subtitle: "New conversation",
      phone: to,
      lastMessagePreview: null,
      lastMessageAt: null,
      unreadCount: 0,
      contactId: null,
      updatedAt: null,
    };

    setConvos((prev) => [local, ...prev]);
    setSelectedId(localId);
    setActiveConvo(local);
    setNewTo("");
    setMode("chat");
    setRightTab("thread");
  }

  const callGroups = useMemo(() => groupCallsByDay(calls), [calls]);

  return (
    <section className="space-y-4">
      {/* Comms entitlement lock */}
      {commsLocked && (
        <div className="rounded-2xl border border-amber-200/50 bg-amber-500/10 px-5 py-4 text-[11px] text-amber-50 shadow-[0_0_26px_rgba(248,250,252,0.16)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/90">
            Comms locked
          </p>
          <p className="mt-2 text-[11px] text-[var(--avillo-cream-soft)]">
            {commsLockMsg || "Comms requires a Pro plan (or Beta access) to use calling + texting."}
          </p>
          <p className="mt-2 text-[10px] text-[var(--avillo-cream-muted)]">
            Once the workspace is upgraded/reactivated, refresh this page.
          </p>
        </div>
      )}

      {/* My Number onboarding */}
      {!commsLocked && (
        <div className="rounded-2xl border border-slate-700/70 bg-slate-950/80 px-5 py-4 shadow-[0_0_40px_rgba(15,23,42,0.9)]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/80">
                Your number
              </p>

              {loadingMyNumber ? (
                <p className="mt-1 text-[10px] text-[var(--avillo-cream-muted)]">Loading…</p>
              ) : hasMyNumber ? (
                <p className="mt-1 text-[11px] text-[var(--avillo-cream-soft)]">
                  Active: <span className="font-semibold text-slate-50">{myNumber?.e164}</span>
                </p>
              ) : (
                <p className="mt-1 text-[10px] text-[var(--avillo-cream-muted)]">
                  You don’t have a number yet. Provision one to enable calling + texting.
                </p>
              )}

              {myNumberError && (
                <div className="mt-3 rounded-xl border border-rose-400/60 bg-rose-950/40 px-4 py-3 text-[11px] text-rose-50">
                  {myNumberError}
                </div>
              )}
            </div>

            {!loadingMyNumber && hasMyNumber ? (
              <span className="shrink-0 rounded-full border border-emerald-200/70 bg-emerald-500/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-100">
                Ready
              </span>
            ) : (
              <span className="shrink-0 rounded-full border border-amber-200/70 bg-amber-500/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-100">
                Setup
              </span>
            )}
          </div>

          {needsNumber && (
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <input
                  value={areaCode}
                  onChange={(e) => setAreaCode(e.target.value)}
                  placeholder="Area code (optional)"
                  className="avillo-input w-full text-slate-50 sm:w-[180px]"
                  disabled={provisioningNumber}
                />
                <p className="text-[10px] text-[var(--avillo-cream-muted)]">
                  We’ll pick a US local number.
                </p>
              </div>

              <button
                type="button"
                onClick={handleProvisionMyNumber}
                disabled={provisioningNumber}
                className="inline-flex items-center justify-center rounded-full border border-amber-100/80 bg-amber-50/10 px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-50 shadow-[0_0_18px_rgba(248,250,252,0.18)] hover:bg-amber-50/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {provisioningNumber ? "Provisioning…" : "Get my number"}
              </button>
            </div>
          )}
        </div>
      )}

      {error && !commsLocked && (
        <div className="rounded-xl border border-rose-400/60 bg-rose-950/40 px-4 py-3 text-[11px] text-rose-50">
          {error}
        </div>
      )}

      {/* TOP: Big pills */}
      <div className="flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => setMode("calls")}
          disabled={commsLocked}
          className={cx(
            avilloTabPillClass(mode === "calls"),
            "px-6 py-2 text-[11px]",
            mode === "calls" ? "shadow-[0_0_22px_rgba(16,185,129,0.14)]" : "",
            commsLocked ? "opacity-60 cursor-not-allowed" : ""
          )}
        >
          Calls
        </button>

        <button
          type="button"
          onClick={() => setMode("chat")}
          disabled={commsLocked}
          className={cx(
            avilloTabPillClass(mode === "chat"),
            "px-6 py-2 text-[11px]",
            commsLocked ? "opacity-60 cursor-not-allowed" : ""
          )}
        >
          Chat
        </button>
      </div>

      {/* Contact-centered wrapper */}
      <div className="mx-auto w-full max-w-7xl">
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)_minmax(0,360px)]">
          {/* LEFT: List */}
          <div
            ref={listHeaderRef}
            className={
              "relative overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-950/80 px-5 py-4 shadow-[0_0_40px_rgba(15,23,42,0.9)] " +
              (workspaceOpenMobile ? "hidden" : "block") +
              " lg:block lg:flex lg:flex-col lg:max-h-[calc(100vh-200px)]"
            }
          >
            <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,_rgba(248,250,252,0.18),transparent_55%)] opacity-40 blur-3xl" />

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/80">
                    {mode === "calls" ? "Call log" : "Chats"}
                  </p>
                  <p className="mt-1 text-[10px] text-[var(--avillo-cream-muted)]">
                    {mode === "calls"
                      ? "Calls, voicemails, and activity — tied to your CRM."
                      : "Private threads — tied to your CRM."}
                  </p>
                </div>

                <p className="text-[11px] text-[var(--avillo-cream-muted)]">
                  {filteredConvos.length} {filteredConvos.length === 1 ? "item" : "items"}
                </p>
              </div>

              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search"
                className="avillo-input w-full text-slate-50"
                disabled={commsLocked}
              />

              <div className="rounded-xl border border-slate-700/70 bg-slate-900/50 px-3 py-2 text-[11px] text-[var(--avillo-cream-muted)]">
                Waiting list <span className="opacity-60">(coming soon)</span>
              </div>
            </div>

            <div ref={listScrollRef} className="mt-3 flex-1 min-h-0 space-y-2 overflow-y-auto pr-1">
              {loadingConvos && (
                <p className="py-6 text-center text-[11px] text-[var(--avillo-cream-muted)]">
                  Loading…
                </p>
              )}

              {!loadingConvos && filteredConvos.length === 0 && (
                <p className="py-6 text-center text-[11px] text-[var(--avillo-cream-muted)]">
                  No results.
                </p>
              )}

              {!loadingConvos &&
                filteredConvos.map((c) => {
                  const isSelected = c.id === selectedId;
                  const badge =
                    typeof c.unreadCount === "number" && c.unreadCount > 0 ? c.unreadCount : 0;

                  const isLocal = isLocalConvoId(c.id);

                  return (
                    <button
                      key={c.id}
                      type="button"
                      data-convo-id={c.id}
                      onClick={() => setSelectedId(c.id)}
                      disabled={commsLocked}
                      className={cx(
                        "w-full rounded-xl border px-4 py-3 text-left transition-colors",
                        isSelected
                          ? "border-amber-200/80 bg-slate-900/90 shadow-[0_0_28px_rgba(248,250,252,0.22)]"
                          : "border-slate-800/80 bg-slate-900/60 hover:border-amber-100/70 hover:bg-slate-900/90",
                        commsLocked ? "opacity-60 cursor-not-allowed" : ""
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                          <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-700/80 bg-slate-950/70 text-[11px] font-semibold text-slate-50">
                            {initials(c.title || "U")}
                          </span>

                          <div className="min-w-0">
                            <p className="truncate text-[12px] font-semibold text-slate-50">
                              {c.title || "Unknown"}
                              {isLocal ? (
                                <span className="ml-2 rounded-full border border-amber-200/50 bg-amber-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-amber-100">
                                  draft
                                </span>
                              ) : null}
                            </p>
                            <p className="mt-0.5 truncate text-[10px] text-[var(--avillo-cream-muted)]">
                              {c.phone || c.subtitle || "—"}
                            </p>

                            {mode === "chat" ? (
                              c.lastMessagePreview ? (
                                <p className="mt-2 line-clamp-2 text-[11px] text-[var(--avillo-cream-soft)]">
                                  {c.lastMessagePreview}
                                </p>
                              ) : (
                                <p className="mt-2 text-[11px] italic text-[var(--avillo-cream-muted)]">
                                  {isLocal
                                    ? "Send the first text to create this thread."
                                    : "No messages yet."}
                                </p>
                              )
                            ) : (
                              <p className="mt-2 text-[11px] text-[var(--avillo-cream-soft)]">
                                {isLocal
                                  ? "Start a call to create this thread."
                                  : c.lastMessageAt
                                    ? "Tap to view call activity"
                                    : "No activity yet."}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex shrink-0 flex-col items-end gap-2">
                          <span className="text-[10px] text-[var(--avillo-cream-muted)]">
                            {formatWhen(c.lastMessageAt)}
                          </span>

                          {badge ? (
                            <span className="inline-flex min-w-[22px] items-center justify-center rounded-full border border-amber-200/70 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-100">
                              {badge > 99 ? "99+" : badge}
                            </span>
                          ) : null}

                          <div className="mt-1 flex items-center gap-1">
                            <MiniIconButton
                              label="Call"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setSelectedId(c.id);
                                setTimeout(() => void handleStartCallFor(c), 0);
                              }}
                              disabled={actionsDisabled}
                            >
                              ☎︎
                            </MiniIconButton>

                            <MiniIconButton
                              label="Chat"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setSelectedId(c.id);
                                setMode("chat");
                                setRightTab("thread");
                              }}
                              disabled={commsLocked}
                            >
                              💬
                            </MiniIconButton>

                            <MiniIconButton
                              label="Star"
                              onClick={(e) => e.stopPropagation()}
                              disabled={commsLocked}
                            >
                              ☆
                            </MiniIconButton>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
            </div>
          </div>

          {/* CENTER: Workspace */}
          <div
            ref={workspaceRef as any}
            className={
              "relative overflow-hidden rounded-2xl border border-amber-100/20 bg-gradient-to-b from-slate-900/80 to-slate-950 px-5 py-4 shadow-[0_0_55px_rgba(15,23,42,0.95)] " +
              (workspaceOpenMobile ? "block" : "hidden") +
              " lg:block lg:flex lg:flex-col lg:max-h-[calc(100vh-200px)]"
            }
          >
            <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(248,250,252,0.2),transparent_55%)] opacity-40 blur-3xl" />

            <div className="flex-1 overflow-y-auto">
              {!activeConvo && (
                <div className="flex h-full flex-col items-center justify-center text-center text-[11px] text-[var(--avillo-cream-muted)]">
                  <p className="font-semibold text-[var(--avillo-cream-soft)]">Select a contact</p>
                  <p className="mt-1 max-w-xs">
                    Pick a person from the list to view their{" "}
                    {mode === "calls" ? "call activity" : "messages"}.
                  </p>
                </div>
              )}

              {activeConvo && (
                <div className="space-y-4 text-xs text-[var(--avillo-cream-soft)]">
                  {/* Mobile back */}
                  <div className="relative mb-2 lg:hidden">
                    <button
                      type="button"
                      onClick={backToListAndClearSelection}
                      className="absolute right-0 top-0 inline-flex items-center gap-2 rounded-full border border-slate-600/80 bg-slate-900/80 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.20em] text-[var(--avillo-cream-soft)] shadow-[0_0_18px_rgba(15,23,42,0.9)] hover:border-amber-100/80 hover:text-amber-50 hover:bg-slate-900/95"
                    >
                      <span className="text-xs">←</span>
                      <span>Back</span>
                    </button>
                  </div>
                  <div className="h-3 lg:hidden" />

                  {/* Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[12px] font-semibold text-slate-50">
                        {activeConvo.title || "Unknown"}
                        {activeIsLocal ? (
                          <span className="ml-2 rounded-full border border-amber-200/50 bg-amber-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-amber-100">
                            draft
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 truncate text-[10px] text-[var(--avillo-cream-muted)]">
                        {activeConvo.phone || activeConvo.subtitle || "No number"}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={handleStartCall}
                        disabled={!activeConvo || actionsDisabled}
                        className="rounded-full border border-emerald-200/70 bg-emerald-500/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-100 shadow-[0_0_16px_rgba(16,185,129,0.18)] hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Call
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setMode("chat");
                          setRightTab("thread");
                        }}
                        disabled={!activeConvo || commsLocked}
                        className="rounded-full border border-amber-100/70 bg-amber-50/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-100 hover:bg-amber-50/20 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Chat
                      </button>
                    </div>
                  </div>

                  {/* Tabs */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setRightTab(mode === "calls" ? "activity" : "thread")}
                      disabled={commsLocked}
                      className={cx(
                        avilloTabPillClass(
                          mode === "calls" ? rightTab === "activity" : rightTab === "thread"
                        ),
                        commsLocked ? "opacity-60 cursor-not-allowed" : ""
                      )}
                    >
                      {mode === "calls" ? "Activity" : "Thread"}
                    </button>

                    <button
                      type="button"
                      onClick={() => setRightTab("info")}
                      disabled={commsLocked}
                      className={cx(
                        avilloTabPillClass(rightTab === "info"),
                        commsLocked ? "opacity-60 cursor-not-allowed" : ""
                      )}
                    >
                      Info
                    </button>
                  </div>

                  {/* CALLS MODE */}
                  {mode === "calls" && rightTab === "activity" && (
                    <WorkspaceCalls
                      calls={calls}
                      callGroups={callGroups}
                      loadingCalls={loadingCalls}
                      callsError={callsError}
                      onStartCall={handleStartCall}
                      setMode={setMode}
                      setRightTab={setRightTab}
                      disabled={actionsDisabled}
                      isLocal={activeIsLocal}
                    />
                  )}

                  {/* CHAT MODE */}
                  {mode === "chat" && rightTab === "thread" && (
                    <WorkspaceThread
                      activeConvo={activeConvo}
                      messages={messages}
                      loadingMsgs={loadingMsgs}
                      msgsError={msgsError}
                      activeDraft={activeDraft}
                      sending={sending}
                      onDraftChange={(v) => setDrafts((prev) => ({ ...prev, [activeConvo.id]: v }))}
                      onSend={handleSend}
                      disabled={actionsDisabled}
                      isLocal={activeIsLocal}
                    />
                  )}

                  {/* INFO */}
                  {rightTab === "info" && (
                    <div className="space-y-3">
                      <div className="rounded-xl border border-slate-700/80 bg-slate-900/70 px-4 py-3">
                        <p className="text-[11px] font-semibold text-amber-100/90">Details</p>
                        <p className="mt-1 text-[10px] text-[var(--avillo-cream-muted)]">
                          Identity, routing, and CRM context.
                        </p>

                        <div className="mt-3 grid gap-2 text-[11px] sm:grid-cols-2">
                          <InfoRow label="Contact" value={activeConvo.title || "Unknown"} />
                          <InfoRow label="Phone" value={activeConvo.phone || "—"} />
                          <InfoRow
                            label="Last activity"
                            value={
                              activeConvo.lastMessageAt ? formatWhen(activeConvo.lastMessageAt) : "—"
                            }
                          />
                          <InfoRow label="Unread" value={String(activeConvo.unreadCount ?? 0)} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: Dialer */}
          <div className="hidden xl:block">
            <div className="relative overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-950/80 px-5 py-4 shadow-[0_0_40px_rgba(15,23,42,0.9)]">
              <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,_rgba(248,250,252,0.16),transparent_55%)] opacity-40 blur-3xl" />

              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/80">
                    Dialer
                  </p>
                  <p className="mt-1 text-[10px] text-[var(--avillo-cream-muted)]">
                    Quick controls (dialer UI comes next).
                  </p>
                </div>

                <span
                  className={cx(
                    "rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]",
                    mode === "calls"
                      ? "border-emerald-200/70 bg-emerald-500/10 text-emerald-100"
                      : "border-slate-600/80 bg-slate-900/60 text-[var(--avillo-cream-muted)]"
                  )}
                >
                  {mode === "calls" ? "Calls" : "Chat"}
                </span>
              </div>

              <div className="mt-4 rounded-xl border border-slate-700/80 bg-slate-900/60 p-3">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-700/80 bg-slate-950/70 text-[12px] font-semibold text-slate-50">
                    {initials(activeConvo?.title || "Av")}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[12px] font-semibold text-slate-50">
                      {activeConvo?.title || "No one selected"}
                    </p>
                    <p className="truncate text-[10px] text-[var(--avillo-cream-muted)]">
                      {activeConvo?.phone || activeConvo?.subtitle || "Select a thread to call/text"}
                    </p>
                  </div>
                </div>

                <div className="mt-3 grid gap-2">
                  <button
                    type="button"
                    onClick={handleStartCall}
                    disabled={!activeConvo || actionsDisabled}
                    className="inline-flex items-center justify-center rounded-full border border-emerald-200/70 bg-emerald-500/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100 shadow-[0_0_18px_rgba(16,185,129,0.18)] hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Place call
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setMode("chat");
                      setRightTab("thread");
                    }}
                    disabled={!activeConvo || commsLocked}
                    className="inline-flex items-center justify-center rounded-full border border-amber-100/70 bg-amber-50/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100 hover:bg-amber-50/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Open chat
                  </button>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-slate-700/80 bg-slate-900/60 px-4 py-3">
                <p className="text-[11px] font-semibold text-amber-100/90">Quick start</p>
                <p className="mt-1 text-[10px] text-[var(--avillo-cream-muted)]">
                  Start a new text thread by number.
                </p>

                <div className="mt-2 flex items-center gap-2">
                  <input
                    value={newTo}
                    onChange={(e) => setNewTo(e.target.value)}
                    placeholder="(555) 123-4567"
                    className="avillo-input w-full text-slate-50"
                    disabled={commsLocked || !hasMyNumber}
                  />
                  <button
                    type="button"
                    onClick={handleStartNewThread}
                    disabled={commsLocked || !hasMyNumber}
                    className="shrink-0 rounded-full border border-amber-100/70 bg-amber-50/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100 hover:bg-amber-50/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Start
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------
 * Extracted UI blocks
 * -----------------------------------*/

function WorkspaceThread({
  activeConvo,
  messages,
  loadingMsgs,
  msgsError,
  activeDraft,
  sending,
  onDraftChange,
  onSend,
  disabled,
  isLocal,
}: {
  activeConvo: Conversation;
  messages: SmsMessage[];
  loadingMsgs: boolean;
  msgsError: string | null;
  activeDraft: string;
  sending: boolean;
  onDraftChange: (v: string) => void;
  onSend: () => void;
  disabled: boolean;
  isLocal: boolean;
}) {
  return (
    <div className="space-y-3">
      {msgsError && (
        <div className="rounded-xl border border-rose-400/60 bg-rose-950/40 px-4 py-3 text-[11px] text-rose-50">
          {msgsError}
        </div>
      )}

      {isLocal && (
        <div className="rounded-xl border border-amber-200/50 bg-amber-500/10 px-4 py-3 text-[11px] text-amber-50">
          This is a draft thread. Send the first text to create the conversation.
        </div>
      )}

      <div className="rounded-xl border border-slate-700/80 bg-slate-900/70 px-4 py-3">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold text-amber-100/90">Messages</p>
          <p className="text-[10px] text-[var(--avillo-cream-muted)]">
            {loadingMsgs ? "Loading…" : `${messages.length} message${messages.length === 1 ? "" : "s"}`}
          </p>
        </div>

        <div className="mt-3 max-h-[420px] space-y-2 overflow-y-auto pr-1 overscroll-contain">
          {loadingMsgs && (
            <p className="py-6 text-center text-[11px] text-[var(--avillo-cream-muted)]">
              Loading thread…
            </p>
          )}

          {!loadingMsgs && messages.length === 0 && (
            <p className="py-6 text-center text-[11px] text-[var(--avillo-cream-muted)]">
              No messages yet. Send the first text.
            </p>
          )}

          {!loadingMsgs &&
            messages.map((m) => {
              const outbound = m.direction === "OUTBOUND";
              const stamp = formatWhen(m.createdAt);

              return (
                <div key={m.id} className={cx("flex", outbound ? "justify-end" : "justify-start")}>
                  <div
                    className={cx(
                      "max-w-[86%] rounded-2xl border px-3 py-2 text-[11px] shadow-[0_0_18px_rgba(15,23,42,0.55)]",
                      outbound
                        ? "border-amber-200/60 bg-amber-500/10 text-amber-50"
                        : "border-slate-700/80 bg-slate-950/60 text-slate-50"
                    )}
                  >
                    <p className="whitespace-pre-wrap">{m.body}</p>
                    <div className="mt-1 flex items-center justify-between gap-3">
                      <span className="text-[9px] text-[var(--avillo-cream-muted)]">{stamp}</span>
                      {m.status ? (
                        <span className="text-[9px] text-[var(--avillo-cream-muted)]">
                          {String(m.status)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
        </div>

        <div className="mt-3 space-y-2">
          <textarea
            rows={3}
            value={activeDraft}
            onChange={(e) => onDraftChange(e.target.value)}
            placeholder="Write a message…"
            disabled={disabled}
            className="w-full resize-none rounded-md border border-slate-800 bg-slate-950/70 px-2 py-1.5 text-[11px] text-slate-50 outline-none placeholder:text-[var(--avillo-cream-muted)] focus:border-amber-200/80 focus:ring-1 focus:ring-amber-200/50 disabled:opacity-60"
          />

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onSend}
              disabled={disabled || !activeDraft.trim()}
              className="inline-flex items-center justify-center rounded-full border border-amber-100/80 bg-amber-50/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-50 shadow-[0_0_18px_rgba(248,250,252,0.28)] hover:bg-amber-50/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {sending ? "Sending…" : "Send"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function WorkspaceCalls({
  calls,
  callGroups,
  loadingCalls,
  callsError,
  onStartCall,
  setMode,
  setRightTab,
  disabled,
  isLocal,
}: {
  calls: CallItem[];
  callGroups: { key: string; label: string; items: CallItem[] }[];
  loadingCalls: boolean;
  callsError: string | null;
  onStartCall: () => void;
  setMode: (m: CommsMode) => void;
  setRightTab: (t: RightTab) => void;
  disabled: boolean;
  isLocal: boolean;
}) {
  return (
    <div className="space-y-3">
      {callsError && (
        <div className="rounded-xl border border-rose-400/60 bg-rose-950/40 px-4 py-3 text-[11px] text-rose-50">
          {callsError}
        </div>
      )}

      {isLocal && (
        <div className="rounded-xl border border-amber-200/50 bg-amber-500/10 px-4 py-3 text-[11px] text-amber-50">
          This is a draft thread. Place the first call to create the conversation.
        </div>
      )}

      <div className="rounded-xl border border-slate-700/80 bg-slate-900/70 px-4 py-3">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold text-amber-100/90">Call activity</p>
          <p className="text-[10px] text-[var(--avillo-cream-muted)]">
            {loadingCalls ? "Loading…" : `${calls.length} call${calls.length === 1 ? "" : "s"}`}
          </p>
        </div>

        {loadingCalls && (
          <p className="mt-3 text-[11px] text-[var(--avillo-cream-muted)]">Loading calls…</p>
        )}

        {!loadingCalls && calls.length === 0 && (
          <div className="mt-3 rounded-lg border border-slate-800/80 bg-slate-950/40 px-3 py-2">
            <p className="text-[11px] italic text-[var(--avillo-cream-muted)]">No calls yet.</p>
            <p className="mt-1 text-[10px] text-[var(--avillo-cream-muted)]">
              Place a call and it’ll show up here.
            </p>
          </div>
        )}

        {!loadingCalls && calls.length > 0 && (
          <div className="mt-3 max-h-[520px] space-y-4 overflow-y-auto pr-1 overscroll-contain">
            {callGroups.map((g) => (
              <div key={g.key} className="space-y-2">
                <div className="rounded-lg border border-slate-800/80 bg-slate-950/40 px-3 py-2">
                  <p className="text-[11px] font-semibold text-[var(--avillo-cream-soft)]">{g.label}</p>
                </div>

                <div className="space-y-2">
                  {g.items.slice(0, 50).map((c) => {
                    const when = formatWhen(c.startedAt || c.createdAt || null);
                    const dir = c.direction === "INBOUND" ? "Inbound" : "Outbound";
                    const dur =
                      typeof c.durationSec === "number" && c.durationSec >= 0
                        ? `${Math.floor(c.durationSec / 60)}:${String(c.durationSec % 60).padStart(2, "0")}`
                        : null;

                    const completed =
                      String(c.status || "").toUpperCase() === "COMPLETED" ||
                      String(c.status || "").toUpperCase() === "SUCCESS";

                    return (
                      <div
                        key={c.id}
                        className="rounded-lg border border-slate-800/80 bg-slate-950/50 px-3 py-2"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-[11px] font-semibold text-slate-50">
                              {dir} call
                            </p>
                            <p className="mt-0.5 text-[10px] text-[var(--avillo-cream-muted)]">
                              {when || "Logged activity"}
                              {dur ? ` • ${dur}` : ""}
                            </p>
                            <p className="mt-1 text-[10px] text-[var(--avillo-cream-soft)]">
                              {c.from || "—"} → {c.to || "—"}
                            </p>
                          </div>

                          <div className="flex shrink-0 items-center gap-2">
                            <span
                              className={cx(
                                "rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]",
                                completed
                                  ? "border-emerald-200/70 bg-emerald-500/10 text-emerald-100"
                                  : "border-amber-200/70 bg-amber-500/10 text-amber-100"
                              )}
                            >
                              {String(c.status || "logged").toLowerCase()}
                            </span>

                            <MiniIconButton
                              label="Call back"
                              onClick={() => {
                                setMode("calls");
                                setRightTab("activity");
                                setTimeout(() => void onStartCall(), 0);
                              }}
                              disabled={disabled}
                            >
                              ☎︎
                            </MiniIconButton>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-3 flex items-center justify-end">
          <button
            type="button"
            onClick={onStartCall}
            disabled={disabled}
            className="inline-flex items-center justify-center rounded-full border border-emerald-200/70 bg-emerald-500/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100 shadow-[0_0_18px_rgba(16,185,129,0.18)] hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Place call
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------
 * Small UI helpers
 * -----------------------------------*/

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-700/80 bg-slate-950/40 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)]">
        {label}
      </p>
      <p className="mt-0.5 truncate text-[11px] text-slate-50">{value}</p>
    </div>
  );
}

function MiniIconButton({
  label,
  onClick,
  children,
  disabled,
}: {
  label: string;
  onClick?: (e: any) => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cx(
        "inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-700/80 bg-slate-950/60 text-[11px] text-[var(--avillo-cream-soft)] hover:border-amber-100/70 hover:text-amber-50",
        disabled ? "opacity-50 cursor-not-allowed hover:border-slate-700/80 hover:text-[var(--avillo-cream-soft)]" : ""
      )}
    >
      {children}
    </button>
  );
}

function groupCallsByDay(items: CallItem[]) {
  const sorted = (items ?? []).slice().sort((a, b) => {
    const at = a.startedAt
      ? new Date(a.startedAt).getTime()
      : a.createdAt
        ? new Date(a.createdAt).getTime()
        : 0;
    const bt = b.startedAt
      ? new Date(b.startedAt).getTime()
      : b.createdAt
        ? new Date(b.createdAt).getTime()
        : 0;
    return bt - at;
  });

  const map = new Map<string, { key: string; label: string; items: CallItem[] }>();

  for (const c of sorted) {
    const raw = c.startedAt || c.createdAt || null;
    const d = raw ? new Date(raw) : null;

    const key = d
      ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
      : "unknown";

    const label = d
      ? d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })
      : "Logged activity";

    const bucket = map.get(key) ?? { key, label, items: [] };
    bucket.items.push(c);
    map.set(key, bucket);
  }

  return Array.from(map.values()).sort((a, b) => (a.key < b.key ? 1 : -1));
}
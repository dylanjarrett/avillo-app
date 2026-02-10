// src/components/comms/comms-shell.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useCrmMobileWorkspaceScroll } from "@/hooks/useCrmMobileWorkspaceScroll";

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
type Mode = "chat" | "calls";

function isAbortError(err: any) {
  return (
    err?.name === "AbortError" ||
    err?.code === "ABORT_ERR" ||
    String(err?.message ?? "").toLowerCase().includes("aborted")
  );
}

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

  if (msg.length > 500) return msg.slice(0, 500) + "…";
  return msg;
}

function isMobile() {
  return typeof window !== "undefined" && window.innerWidth < 1024;
}

export default function CommsShell() {
  const { listHeaderRef, workspaceRef, scrollToWorkspace, scrollBackToListHeader } =
    useCrmMobileWorkspaceScroll();

  const listScrollRef = useRef<HTMLDivElement | null>(null);

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

  // My number
  const [myNumber, setMyNumber] = useState<MyNumber | null>(null);
  const [loadingMyNumber, setLoadingMyNumber] = useState(true);
  const [myNumberError, setMyNumberError] = useState<string | null>(null);
  const [areaCode, setAreaCode] = useState("");
  const [provisioningNumber, setProvisioningNumber] = useState(false);

  const hasMyNumber = !!myNumber?.e164;
  const activeDraft = activeConvo?.id ? drafts[activeConvo.id] ?? "" : "";
  const activeIsLocal = isLocalConvoId(activeConvo?.id);
  const actionsDisabled = commsLocked || sending || !hasMyNumber;

  // Quick start
  const [newTo, setNewTo] = useState("");

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

        if (looksLikeEntitlementError(msg)) {
          setCommsLocked(true);
          setCommsLockMsg(msg);
        }
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

        // success => clear lock if previously set
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

        // keep selection if it still exists
        if (selectedId && !sorted.find((c) => c.id === selectedId)) {
          setSelectedId(null);
        }
      } catch (e: any) {
        if (isAbortError(e)) return;

        const msg = e?.message || "We couldn’t load your conversations.";
        setError(msg);
        setConvos([]);
        setSelectedId(null);

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
    if (commsLocked || mode !== "chat" || !activeConvo?.id || isLocalConvoId(activeConvo.id)) {
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
  }, [activeConvo?.id, mode, commsLocked]);

  // ---------- Load calls ----------
  useEffect(() => {
    if (commsLocked || mode !== "calls" || !activeConvo?.id || isLocalConvoId(activeConvo.id)) {
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
  }, [activeConvo?.id, mode, commsLocked]);

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

    if (match) setSelectedId(match.id);
    return match;
  }

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

      // optimistic bubble
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

      await sendSms({
        to,
        body,
        conversationId: activeIsLocal ? null : activeConvo.id,
      });

      const match = await refreshConversationsAndReselectByPhone(to);

      // reload messages only if real id exists
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
        conversationId: isLocalConvoId(convo.id) ? null : convo.id,
      });

      await refreshConversationsAndReselectByPhone(to);
      setMode("calls");
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
    return handleStartCallFor(activeConvo);
  }

  function handleStartNewThread() {
    if (commsLocked) return;

    if (!hasMyNumber) {
      setError("You need a phone number before you can start a new thread.");
      return;
    }

    const to = normalizePhone(newTo);
    if (!to) return;

    const found = convos.find((c) => normalizePhone(c.phone || c.subtitle || "") === to);
    if (found) {
      setSelectedId(found.id);
      setNewTo("");
      setMode("chat");
      return;
    }

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
    setNewTo("");
    setMode("chat");
  }

  function onPickConvo(id: string) {
    setSelectedId(id);
    setMsgsError(null);
    setCallsError(null);
  }

  function backToList() {
    setWorkspaceOpenMobile(false);
    scrollBackToListHeader(() => {});
  }

  return (
    <section className="mx-auto w-full max-w-6xl">
      <div className="overflow-hidden rounded-2xl border border-slate-800/70 bg-slate-950/70 shadow-[0_0_40px_rgba(15,23,42,0.85)]">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-slate-800/70 bg-slate-950/85 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-slate-50">Comms</p>
            <p className="truncate text-[11px] text-[var(--avillo-cream-muted)]">
              {commsLocked
                ? "Locked"
                : loadingMyNumber
                  ? "Loading number…"
                  : hasMyNumber
                    ? `From: ${myNumber?.e164}`
                    : "No number"}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Segmented
              value={mode}
              onChange={setMode}
              disabled={commsLocked}
              options={[
                { value: "chat", label: "Chat" },
                { value: "calls", label: "Calls" },
              ]}
            />
          </div>
        </div>

        {/* Lock */}
        {commsLocked && (
          <div className="border-b border-amber-200/30 bg-amber-500/10 px-4 py-3">
            <p className="text-[11px] font-semibold text-amber-100">Comms locked</p>
            <p className="mt-1 text-[11px] text-[var(--avillo-cream-soft)]">
              {commsLockMsg || "Comms requires a Pro plan (or Beta access)."}
            </p>
          </div>
        )}

        {/* Setup (only if not locked) */}
        {!commsLocked && (
          <div className="border-b border-slate-800/70 px-4 py-3">
            {!hasMyNumber ? (
              <div className="space-y-2">
                <p className="text-[11px] text-[var(--avillo-cream-muted)]">
                  You need a number to call/text.
                </p>
                {myNumberError && (
                  <div className="rounded-xl border border-rose-400/60 bg-rose-950/40 px-3 py-2 text-[11px] text-rose-50">
                    {myNumberError}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <input
                    value={areaCode}
                    onChange={(e) => setAreaCode(e.target.value)}
                    placeholder="Area code (optional)"
                    className="avillo-input w-full text-slate-50"
                    disabled={loadingMyNumber || provisioningNumber}
                  />
                  <button
                    type="button"
                    onClick={handleProvisionMyNumber}
                    disabled={loadingMyNumber || provisioningNumber}
                    className="shrink-0 rounded-full border border-amber-100/70 bg-amber-50/10 px-4 py-2 text-[11px] font-semibold text-amber-50 hover:bg-amber-50/20 disabled:opacity-60"
                  >
                    {provisioningNumber ? "…" : "Get"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] text-[var(--avillo-cream-muted)]">
                  Ready to send + call.
                </p>
                <div className="flex items-center gap-2">
                  <input
                    value={newTo}
                    onChange={(e) => setNewTo(e.target.value)}
                    placeholder="Start by number…"
                    className="avillo-input w-[220px] text-slate-50"
                    disabled={!hasMyNumber}
                  />
                  <button
                    type="button"
                    onClick={handleStartNewThread}
                    disabled={!hasMyNumber}
                    className="rounded-full border border-slate-800/70 bg-slate-950/60 px-3 py-2 text-[11px] font-semibold text-[var(--avillo-cream-soft)] hover:border-amber-100/60 hover:text-amber-50 disabled:opacity-60"
                  >
                    New
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Body */}
        <div className="grid lg:grid-cols-[360px_1fr]">
          {/* List */}
          <div
            ref={listHeaderRef}
            className={cx(
              "border-r border-slate-800/70 bg-slate-950/55",
              workspaceOpenMobile ? "hidden" : "block",
              "lg:block"
            )}
          >
            <div className="p-4">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search"
                className="avillo-input w-full text-slate-50"
                disabled={commsLocked}
              />
              {error && !commsLocked && (
                <div className="mt-3 rounded-xl border border-rose-400/60 bg-rose-950/40 px-3 py-2 text-[11px] text-rose-50">
                  {error}
                </div>
              )}
            </div>

            <div
              ref={listScrollRef}
              className="max-h-[calc(100vh-280px)] overflow-y-auto px-2 pb-3"
            >
              {loadingConvos && (
                <p className="py-10 text-center text-[11px] text-[var(--avillo-cream-muted)]">
                  Loading…
                </p>
              )}

              {!loadingConvos && filteredConvos.length === 0 && (
                <p className="py-10 text-center text-[11px] text-[var(--avillo-cream-muted)]">
                  No results.
                </p>
              )}

              {!loadingConvos &&
                filteredConvos.map((c) => {
                  const isSelected = c.id === selectedId;
                  const isLocal = isLocalConvoId(c.id);

                  return (
                    <button
                      key={c.id}
                      type="button"
                      data-convo-id={c.id}
                      onClick={() => onPickConvo(c.id)}
                      disabled={commsLocked}
                      className={cx(
                        "mb-1 w-full rounded-xl border px-3 py-3 text-left transition-colors",
                        isSelected
                          ? "border-amber-200/60 bg-slate-900/80"
                          : "border-slate-800/70 bg-slate-950/40 hover:bg-slate-900/70 hover:border-slate-700/70",
                        commsLocked ? "opacity-60 cursor-not-allowed" : ""
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-800/80 bg-slate-950/70 text-[11px] font-semibold text-slate-50">
                          {initials(c.title || "U")}
                        </span>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-[12px] font-semibold text-slate-50">
                              {c.title || "Unknown"}
                              {isLocal ? (
                                <span className="ml-2 rounded-full border border-amber-200/40 bg-amber-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-amber-100">
                                  draft
                                </span>
                              ) : null}
                            </p>
                            <p className="shrink-0 text-[10px] text-[var(--avillo-cream-muted)]">
                              {formatWhen(c.lastMessageAt)}
                            </p>
                          </div>

                          <p className="mt-0.5 truncate text-[11px] text-[var(--avillo-cream-muted)]">
                            {c.phone || c.subtitle || "—"}
                          </p>
                        </div>

                        <MiniIconButton
                          label="Call"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onPickConvo(c.id);
                            setTimeout(() => void handleStartCallFor(c), 0);
                          }}
                          disabled={actionsDisabled}
                        >
                          ☎︎
                        </MiniIconButton>
                      </div>
                    </button>
                  );
                })}
            </div>
          </div>

          {/* Detail */}
          <div
            ref={workspaceRef as any}
            className={cx(
              "min-h-[520px] bg-gradient-to-b from-slate-950/40 to-slate-950/70",
              workspaceOpenMobile ? "block" : "hidden",
              "lg:block"
            )}
          >
            <div className="flex items-center justify-between gap-2 border-b border-slate-800/70 px-4 py-3">
              <div className="min-w-0">
                {activeConvo ? (
                  <>
                    <p className="truncate text-[12px] font-semibold text-slate-50">
                      {activeConvo.title || "Unknown"}
                    </p>
                    <p className="truncate text-[11px] text-[var(--avillo-cream-muted)]">
                      {activeConvo.phone || activeConvo.subtitle || "No number"}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-[12px] font-semibold text-slate-50">Select a thread</p>
                    <p className="text-[11px] text-[var(--avillo-cream-muted)]">
                      Pick someone on the left.
                    </p>
                  </>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setWorkspaceOpenMobile(false);
                    scrollBackToListHeader(() => {});
                  }}
                  className="lg:hidden rounded-full border border-slate-800/70 bg-slate-950/60 px-3 py-1.5 text-[11px] font-semibold text-[var(--avillo-cream-soft)] hover:border-amber-100/60 hover:text-amber-50"
                >
                  Back
                </button>

                <button
                  type="button"
                  onClick={() => setMode("chat")}
                  disabled={!activeConvo || commsLocked}
                  className={cx(
                    "rounded-full border border-slate-800/70 bg-slate-950/60 px-3 py-1.5 text-[11px] font-semibold",
                    mode === "chat"
                      ? "text-amber-50 border-amber-200/40"
                      : "text-[var(--avillo-cream-soft)]",
                    !activeConvo || commsLocked ? "opacity-60 cursor-not-allowed" : ""
                  )}
                >
                  Chat
                </button>

                <button
                  type="button"
                  onClick={() => setMode("calls")}
                  disabled={!activeConvo || commsLocked}
                  className={cx(
                    "rounded-full border border-slate-800/70 bg-slate-950/60 px-3 py-1.5 text-[11px] font-semibold",
                    mode === "calls"
                      ? "text-emerald-100 border-emerald-200/40"
                      : "text-[var(--avillo-cream-soft)]",
                    !activeConvo || commsLocked ? "opacity-60 cursor-not-allowed" : ""
                  )}
                >
                  Calls
                </button>

                <button
                  type="button"
                  onClick={handleStartCall}
                  disabled={!activeConvo || actionsDisabled}
                  className={cx(
                    "rounded-full border border-emerald-200/40 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-semibold text-emerald-100",
                    !activeConvo || actionsDisabled ? "opacity-60 cursor-not-allowed" : ""
                  )}
                  title="Call"
                >
                  ☎︎
                </button>
              </div>
            </div>

            <div className="p-4">
              {!activeConvo ? (
                <div className="flex h-[460px] flex-col items-center justify-center text-center text-[11px] text-[var(--avillo-cream-muted)]">
                  <p className="font-semibold text-[var(--avillo-cream-soft)]">Simple Comms</p>
                  <p className="mt-1 max-w-sm">
                    Select a thread. Chat shows messages. Calls shows call activity.
                  </p>
                </div>
              ) : mode === "chat" ? (
                <ThreadSimple
                  isLocal={activeIsLocal}
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
                <CallsSimple
                  isLocal={activeIsLocal}
                  loading={loadingCalls}
                  error={callsError}
                  calls={calls}
                  disabled={actionsDisabled}
                  onStartCall={handleStartCall}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* -----------------------------
 * Minimal UI bits
 * ----------------------------*/

function Segmented({
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
        "inline-flex overflow-hidden rounded-full border border-slate-800/70 bg-slate-950/60",
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
              "px-3 py-1.5 text-[11px] font-semibold",
              active ? "bg-slate-900/80 text-slate-50" : "text-[var(--avillo-cream-muted)]"
            )}
          >
            {o.label}
          </button>
        );
      })}
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
        "inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-800/70 bg-slate-950/60 text-[12px] text-[var(--avillo-cream-soft)]",
        disabled ? "opacity-50 cursor-not-allowed" : "hover:border-amber-100/60 hover:text-amber-50"
      )}
    >
      {children}
    </button>
  );
}

function ThreadSimple({
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
  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-xl border border-rose-400/60 bg-rose-950/40 px-3 py-2 text-[11px] text-rose-50">
          {error}
        </div>
      )}

      {isLocal && (
        <div className="rounded-xl border border-amber-200/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-50">
          Draft thread — send the first text to create it.
        </div>
      )}

      <div className="rounded-2xl border border-slate-800/70 bg-slate-950/45">
        <div className="max-h-[520px] overflow-y-auto p-3 pr-2 overscroll-contain">
          {loading && (
            <p className="py-10 text-center text-[11px] text-[var(--avillo-cream-muted)]">
              Loading…
            </p>
          )}

          {!loading && messages.length === 0 && (
            <p className="py-10 text-center text-[11px] text-[var(--avillo-cream-muted)]">
              No messages yet.
            </p>
          )}

          {!loading &&
            messages.map((m) => {
              const outbound = m.direction === "OUTBOUND";
              return (
                <div
                  key={m.id}
                  className={cx("mb-2 flex", outbound ? "justify-end" : "justify-start")}
                >
                  <div
                    className={cx(
                      "max-w-[86%] rounded-2xl px-3 py-2 text-[12px]",
                      outbound
                        ? "bg-amber-500/15 text-amber-50 border border-amber-200/30"
                        : "bg-slate-900/60 text-slate-50 border border-slate-800/60"
                    )}
                  >
                    <p className="whitespace-pre-wrap leading-relaxed">{m.body}</p>
                    <p className="mt-1 text-[10px] text-[var(--avillo-cream-muted)]">
                      {formatWhen(m.createdAt)}
                    </p>
                  </div>
                </div>
              );
            })}
        </div>

        <div className="border-t border-slate-800/70 p-3">
          <div className="flex items-end gap-2">
            <textarea
              rows={2}
              value={draft}
              onChange={(e) => onDraftChange(e.target.value)}
              placeholder="Message…"
              disabled={disabled}
              className="w-full resize-none rounded-xl border border-slate-800/70 bg-slate-950/70 px-3 py-2 text-[12px] text-slate-50 outline-none placeholder:text-[var(--avillo-cream-muted)] focus:border-amber-200/50 disabled:opacity-60"
            />
            <button
              type="button"
              onClick={onSend}
              disabled={disabled || !draft.trim()}
              className="shrink-0 rounded-full border border-amber-100/70 bg-amber-50/10 px-4 py-2 text-[11px] font-semibold text-amber-50 hover:bg-amber-50/20 disabled:opacity-60"
            >
              {sending ? "…" : "Send"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CallsSimple({
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
    <div className="space-y-3">
      {error && (
        <div className="rounded-xl border border-rose-400/60 bg-rose-950/40 px-3 py-2 text-[11px] text-rose-50">
          {error}
        </div>
      )}

      {isLocal && (
        <div className="rounded-xl border border-amber-200/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-50">
          Draft thread — place the first call to create it.
        </div>
      )}

      <div className="rounded-2xl border border-slate-800/70 bg-slate-950/45">
        <div className="flex items-center justify-between border-b border-slate-800/70 px-3 py-3">
          <p className="text-[12px] font-semibold text-slate-50">Calls</p>
          <button
            type="button"
            onClick={onStartCall}
            disabled={disabled}
            className={cx(
              "rounded-full border border-emerald-200/40 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-semibold text-emerald-100",
              disabled ? "opacity-60 cursor-not-allowed" : "hover:bg-emerald-500/15"
            )}
          >
            Call
          </button>
        </div>

        <div className="max-h-[560px] overflow-y-auto p-3 pr-2 overscroll-contain">
          {loading && (
            <p className="py-10 text-center text-[11px] text-[var(--avillo-cream-muted)]">
              Loading…
            </p>
          )}

          {!loading && calls.length === 0 && (
            <p className="py-10 text-center text-[11px] text-[var(--avillo-cream-muted)]">
              No calls yet.
            </p>
          )}

          {!loading &&
            calls.slice(0, 80).map((c) => (
              <div
                key={c.id}
                className="mb-2 rounded-xl border border-slate-800/70 bg-slate-950/55 px-3 py-2"
              >
                <p className="text-[12px] font-semibold text-slate-50">
                  {c.direction === "INBOUND" ? "Inbound" : "Outbound"} call
                </p>
                <p className="mt-0.5 text-[11px] text-[var(--avillo-cream-muted)]">
                  {formatWhen(c.startedAt || c.createdAt || null)} •{" "}
                  {String(c.status || "logged").toLowerCase()}
                </p>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
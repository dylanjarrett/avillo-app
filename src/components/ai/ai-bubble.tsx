// src/components/ai/ai-bubble.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Msg = { id: string; role: "assistant" | "user"; text: string };

const QUICK_CHIPS = [
  "What should I do today?",
  "Any overdue tasks?",
  "Who needs a follow-up?",
  "Summarize my pipeline",
] as const;

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function IconX(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={props.className}>
      <path d="M7 7l10 10M17 7L7 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconSpark(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={props.className}>
      <path
        d="M12 2l1.4 6.1L20 10l-6.6 1.9L12 18l-1.4-6.1L4 10l6.6-1.9L12 2z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M19.5 16.2l.5 2.2 2.1.5-2.1.5-.5 2.1-.5-2.1-2.1-.5 2.1-.5.5-2.2z"
        fill="currentColor"
        opacity="0.75"
      />
    </svg>
  );
}

function clampStr(v: unknown, max = 3000) {
  if (typeof v !== "string") return "";
  const t = v.trim();
  return t.length > max ? t.slice(0, max) : t;
}

function isNearBottom(el: HTMLElement, thresholdPx = 80) {
  const { scrollTop, scrollHeight, clientHeight } = el;
  return scrollHeight - (scrollTop + clientHeight) <= thresholdPx;
}

export default function AIBubble() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([
    {
      id: uid(),
      role: "assistant",
      text: "Hey — I’m Zora. Ask me anything about your workspace: tasks, people, listings, follow-ups, and what to do next.",
    },
  ]);
  const [isTyping, setIsTyping] = useState(false);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  // Keep a live, reliable messages snapshot (prevents stale context)
  const messagesRef = useRef<Msg[]>(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Prevent overlapping requests
  const inflightRef = useRef<AbortController | null>(null);

  // Track whether we should autoscroll (don’t fight the user)
  const shouldAutoScrollRef = useRef(true);
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;

    const onScroll = () => {
      shouldAutoScrollRef.current = isNearBottom(el, 90);
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    // initialize
    shouldAutoScrollRef.current = isNearBottom(el, 90);

    return () => el.removeEventListener("scroll", onScroll);
  }, [open]);

  // ESC closes
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Focus input + scroll on open
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      inputRef.current?.focus();
      const el = bodyRef.current;
      if (el) el.scrollTo({ top: el.scrollHeight });
    }, 50);
    return () => window.clearTimeout(t);
  }, [open]);

  // Scroll to bottom on new messages (only if user is already near bottom)
  useEffect(() => {
    if (!open) return;
    const el = bodyRef.current;
    if (!el) return;
    if (!shouldAutoScrollRef.current) return;

    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, open, isTyping]);

  useEffect(() => {
    return () => {
      if (inflightRef.current) inflightRef.current.abort();
    };
  }, []);

  function push(role: Msg["role"], text: string) {
    setMessages((prev) => [...prev, { id: uid(), role, text }]);
  }

  async function callAI(nextMessages: Msg[]) {
    const apiMessages = nextMessages.map((m) => ({ role: m.role, text: m.text }));
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

    if (inflightRef.current) inflightRef.current.abort();
    const ac = new AbortController();
    inflightRef.current = ac;

    const res = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: ac.signal,
      body: JSON.stringify({
        page: typeof window !== "undefined" ? window.location.pathname : undefined,
        messages: apiMessages,
        tz,
      }),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      const msg = (data && typeof data.error === "string" && data.error) || `Request failed (${res.status})`;
      throw new Error(msg);
    }

    const reply = data && typeof data.reply === "string" && data.reply.trim() ? data.reply.trim() : null;
    if (!reply) throw new Error("Empty reply from AI.");
    return reply;
  }

  async function send(raw: string) {
    const v = clampStr(raw, 3000);
    if (!v || isTyping) return;

    // Optimistic UI
    const userMsg: Msg = { id: uid(), role: "user", text: v };
    setMessages((prev) => [...prev, userMsg]);
    if (inputRef.current) inputRef.current.value = "";

    setIsTyping(true);

    try {
      // Build from the most reliable snapshot
      const snapshot = [...messagesRef.current, userMsg];
      const reply = await callAI(snapshot);

      push("assistant", reply);
    } catch (err: any) {
      const msg = err?.name === "AbortError" ? "Request cancelled." : err?.message || "Something went wrong.";
      push("assistant", `Sorry — ${msg}`);
    } finally {
      setIsTyping(false);
    }
  }

  function stop() {
    if (inflightRef.current) inflightRef.current.abort();
    inflightRef.current = null;
    setIsTyping(false);
  }

  const sendButtonLabel = useMemo(() => (isTyping ? "Stop" : "Send"), [isTyping]);

  return (
    <>
      {/* Bubble (KEEP EXACT FIXED BUTTON STRUCTURE) */}
      <button
        type="button"
        aria-label={open ? "Close Zora" : "Open Zora"}
        onClick={() => setOpen((v) => !v)}
        className={[
          "fixed z-[80]",
          "right-4",
          "bottom-4",
          "pb-[env(safe-area-inset-bottom)]",
          "h-12 w-12 rounded-full",
          "border border-white/10",
          "bg-[#050814]/80 backdrop-blur",
          "shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_10px_30px_rgba(0,0,0,0.45)]",
          "hover:bg-[#050814]/90",
          "active:scale-[0.98]",
          "transition",
        ].join(" ")}
      >
        <span className="absolute inset-0 rounded-full shadow-[0_0_20px_rgba(230,214,170,0.16)]" />
        <span className="relative flex h-full w-full items-center justify-center text-[#F4E8C8]">
          <IconSpark className="h-[18px] w-[18px] text-[#F4E8C8]" />
        </span>
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed inset-0 z-[79]">
          {/* overlay */}
          <button aria-label="Close overlay" onClick={() => setOpen(false)} className="absolute inset-0 bg-black/40" />

          {/* drawer */}
          <div
            className={[
              "absolute",
              "right-4 bottom-20",
              "max-sm:left-3 max-sm:right-3 max-sm:bottom-20",
              "w-[480px] max-w-[calc(100vw-2rem)]",
              "max-sm:w-auto",
              "rounded-2xl",
              "border border-white/10",
              "overflow-hidden",
              "bg-[#050814]/70 backdrop-blur-2xl",
              "shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_24px_90px_rgba(0,0,0,0.65)]",
              "ring-1 ring-white/5",
            ].join(" ")}
          >
            {/* Ambient neon frame */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-70"
              style={{
                background:
                  "radial-gradient(900px 360px at 10% 0%, rgba(244,232,200,0.10), rgba(0,0,0,0) 55%), radial-gradient(900px 360px at 90% 100%, rgba(26,39,71,0.35), rgba(0,0,0,0) 60%)",
              }}
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-[2px] rounded-2xl opacity-55 blur-[10px]"
              style={{
                background: "linear-gradient(135deg, rgba(244,232,200,0.18), rgba(26,39,71,0.28), rgba(0,0,0,0))",
              }}
            />

            {/* Header */}
            <div className="relative flex items-center justify-between px-4 py-3 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="h-9 w-9 rounded-2xl border border-white/10 bg-white/5 flex items-center justify-center">
                    <IconSpark className="h-4 w-4 text-[#F4E8C8]" />
                  </div>
                  <span className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full bg-[#F4E8C8] shadow-[0_0_16px_rgba(244,232,200,0.35)]" />
                </div>

                <div className="leading-tight">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-semibold text-[#F4E8C8]">Zora</div>
                  </div>
                  <div className="text-[12px] text-white/55">Your Avillo workspace copilot</div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className={[
                  "h-9 w-9 rounded-xl",
                  "border border-white/10",
                  "bg-white/5 hover:bg-white/10",
                  "text-white/70 hover:text-white",
                  "transition",
                  "flex items-center justify-center",
                ].join(" ")}
              >
                <IconX className="h-5 w-5" />
              </button>
            </div>

            {/* Body */}
            <div ref={bodyRef} className="relative px-4 py-3 space-y-3 max-h-[380px] overflow-auto">
              <div className="space-y-2">
                {messages.map((m) => (
                  <div key={m.id} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                    <div
                      className={[
                        "max-w-[92%] rounded-2xl px-3.5 py-2.5",
                        "border border-white/10",
                        m.role === "user" ? "bg-[#1A2747]/45 text-[#F4E8C8]" : "bg-white/5 text-white/80",
                      ].join(" ")}
                    >
                      <div className="text-[13px] leading-relaxed whitespace-pre-wrap">{m.text}</div>
                    </div>
                  </div>
                ))}

                {isTyping && (
                  <div className="flex justify-start">
                    <div className="max-w-[92%] rounded-2xl px-3.5 py-2.5 border border-white/10 bg-white/5 text-white/80">
                      <div className="flex items-center gap-2 text-[13px]">
                        <span className="h-1.5 w-1.5 rounded-full bg-white/50 animate-[avDot_1.1s_infinite]" />
                        <span className="h-1.5 w-1.5 rounded-full bg-white/50 animate-[avDot_1.1s_0.15s_infinite]" />
                        <span className="h-1.5 w-1.5 rounded-full bg-white/50 animate-[avDot_1.1s_0.3s_infinite]" />
                        <span className="text-white/60">Thinking…</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Quick chips (send immediately for fewer taps) */}
              <div className="flex flex-wrap gap-2 pt-1">
                {QUICK_CHIPS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    disabled={isTyping}
                    onClick={() => send(c)}
                    className={[
                      "rounded-full px-3 py-1.5",
                      "text-[12px] text-[#F4E8C8]/90",
                      "border border-white/10",
                      "bg-[#1A2747]/30 hover:bg-[#1A2747]/45",
                      "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]",
                      "transition",
                      isTyping ? "opacity-60 cursor-not-allowed" : "",
                    ].join(" ")}
                  >
                    {c}
                  </button>
                ))}
              </div>

              <div className="text-[11px] text-white/40">
                Tip: Ask for next steps, overdue items, follow-ups, or a quick pipeline summary.
              </div>
            </div>

            {/* Input */}
            <div className="relative border-t border-white/10 p-3">
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  placeholder="Ask Zora…"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      send(inputRef.current?.value ?? "");
                    }
                  }}
                  className={[
                    "flex-1 rounded-xl",
                    "bg-[#1A2747]/35",
                    "border border-white/10",
                    "px-3 py-2",
                    "text-sm text-[#F4E8C8]",
                    "placeholder:text-white/35",
                    "outline-none",
                    "focus:border-white/20 focus:ring-2 focus:ring-[#F4E8C8]/10",
                    "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]",
                  ].join(" ")}
                />

                <button
                  type="button"
                  onClick={() => (isTyping ? stop() : send(inputRef.current?.value ?? ""))}
                  className={[
                    "rounded-xl px-3 py-2 text-sm",
                    "border border-white/10",
                    "bg-white/5 text-[#F4E8C8]",
                    "hover:bg-white/10",
                    "transition",
                  ].join(" ")}
                >
                  {sendButtonLabel}
                </button>
              </div>

              <div className="mt-2 text-[11px] text-white/40">Zora stays available on every page.</div>
            </div>

            <style jsx>{`
              @keyframes avDot {
                0% {
                  opacity: 0.25;
                  transform: translateY(0);
                }
                50% {
                  opacity: 0.9;
                  transform: translateY(-1px);
                }
                100% {
                  opacity: 0.25;
                  transform: translateY(0);
                }
              }
            `}</style>
          </div>
        </div>
      )}
    </>
  );
}
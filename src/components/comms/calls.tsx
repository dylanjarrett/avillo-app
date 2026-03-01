// src/components/comms/calls.tsx
"use client";

import React, { useEffect, useRef } from "react";
import { create } from "zustand";

import type { CallItem, Conversation } from "@/components/comms/comms-types";
import { cx, formatWhen, normalizePhone } from "@/components/comms/comms-utils";
import { normalizeApiError, startCall } from "@/components/comms/api";

/**
 * Apple-level calling surface:
 * - ActiveCallOverlay (full in-call UI)
 * - MiniCallPill (minimized persistent control)
 * - Calls history panel (existing Calls list, refined)
 *
 * Notes:
 * - This ships immediately even if you don't yet have a call-status endpoint.
 * - If you later add GET /api/comms/calls/:id returning { status, connectedAt, endedAt },
 *   the overlay will auto-update phases + timer.
 */

export type CallPhase =
  | "idle"
  | "starting"
  | "ringing"
  | "connecting"
  | "connected"
  | "ended"
  | "failed";

export type ActiveCall = {
  callId: string;
  conversationId: string | null;

  to: string; // e164
  displayName: string;

  phase: CallPhase;

  startedAt: string; // iso
  connectedAt?: string;
  endedAt?: string;

  minimized: boolean;
  lastError?: string | null;

  // UI timer snapshot
  durationSec?: number;
};

type BeginOutgoingArgs = {
  convo: Conversation;
  hasMyNumber: boolean;
  commsLocked: boolean;

  // ✅ required for call bridging (clients never see it)
  forwardingPhone: string | null;
};

type BeginOutgoingResult =
  | { ok: true; callId: string }
  | { ok: false; error: string };

type ActiveCallStore = {
  active: ActiveCall | null;

  setActive: (v: ActiveCall | null) => void;

  minimize: () => void;
  restore: () => void;

  setPhase: (phase: CallPhase, patch?: Partial<ActiveCall>) => void;
  setError: (msg: string) => void;

  endLocal: () => void;

  beginOutgoingCall: (args: BeginOutgoingArgs) => Promise<BeginOutgoingResult>;
};

export const useActiveCallStore = create<ActiveCallStore>((set, get) => ({
  active: null,

  setActive: (v) => set({ active: v }),

  minimize: () =>
    set((s) => (s.active ? { active: { ...s.active, minimized: true } } : s)),
  restore: () =>
    set((s) => (s.active ? { active: { ...s.active, minimized: false } } : s)),

  setPhase: (phase, patch) =>
    set((s) => {
      if (!s.active) return s;
      return { active: { ...s.active, phase, ...(patch || {}) } };
    }),

  setError: (msg) =>
    set((s) => {
      if (!s.active) return s;
      return {
        active: {
          ...s.active,
          phase: "failed",
          lastError: msg,
          minimized: false,
        },
      };
    }),

  endLocal: () =>
    set((s) => {
      if (!s.active) return s;
      return { active: null };
    }),

  beginOutgoingCall: async ({ convo, hasMyNumber, commsLocked, forwardingPhone }) => {
    if (commsLocked) return { ok: false, error: "Comms is locked." };
    if (!hasMyNumber) {
      return { ok: false, error: "You need a phone number before you can place calls." };
    }

    // ✅ bridging requires the user's personal phone
    const fwd = normalizePhone(forwardingPhone || "");
    if (!fwd) {
      return { ok: false, error: "Add your personal phone to enable calling." };
    }

    const to = normalizePhone(convo.phone || convo.subtitle || "");
    if (!to) {
      return { ok: false, error: "This thread doesn’t have a destination phone number yet." };
    }

    // ✅ safety: don't allow calling your own forwarding phone
    if (to === fwd) {
      return { ok: false, error: "You can’t call your own phone number from Avillo." };
    }

    try {
      // ✅ Optimistic: show overlay immediately
      const now = new Date().toISOString();
      const optimisticId = `pending-${Date.now()}`;

      set({
        active: {
          callId: optimisticId,
          conversationId: convo.isDraft ? null : convo.id,
          to,
          displayName: convo.title || "Unknown",
          phase: "starting",
          startedAt: now,
          minimized: false,
          lastError: null,
          durationSec: 0,
        },
      });

      const res: any = await startCall({
        to,
        conversationId: convo.isDraft ? null : convo.id,
      });

      const callId = String(res?.callId || res?.id || "").trim();

      if (!callId) {
        get().setPhase("connecting");
        return { ok: true, callId: optimisticId };
      }

      set((s) => {
        if (!s.active) return s;
        return { active: { ...s.active, callId, phase: "connecting" } };
      });

      return { ok: true, callId };
    } catch (e: any) {
      const msg = normalizeApiError(e, "Failed to start call.");
      get().setError(msg);
      return { ok: false, error: msg };
    }
  },
}));

/* ---------------------------------------
 * Status helpers
 * ------------------------------------- */

function mapBackendStatusToPhase(statusRaw: string | null | undefined): CallPhase {
  const s = String(statusRaw || "").toLowerCase().trim();

  // Twilio-ish mapping (adjust to your enum)
  if (["queued", "initiated", "created"].includes(s)) return "starting";
  if (["ringing"].includes(s)) return "ringing";
  if (["in-progress", "connected"].includes(s)) return "connected";
  if (["completed", "ended"].includes(s)) return "ended";
  if (["failed", "busy", "no-answer", "canceled", "cancelled"].includes(s)) return "failed";

  return "connecting";
}

function phaseLine(active: ActiveCall) {
  if (active.phase === "starting") return "Calling your phone…";
  if (active.phase === "ringing") return "Ringing…";
  if (active.phase === "connecting") return "Dialing the recipient…";
  if (active.phase === "connected") return "Connected";
  if (active.phase === "ended") return "Call ended";
  if (active.phase === "failed") return "Call failed";
  return "";
}

function fmtTimer(sec?: number) {
  const s = Math.max(0, Math.floor(sec || 0));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  const ssStr = ss < 10 ? `0${ss}` : String(ss);
  return `${mm}:${ssStr}`;
}

/**
 * Poll GET /api/comms/calls/:id if it exists.
 * If it does NOT exist yet, this silently does nothing (safe to ship).
 */
function useCallStatusPolling() {
  const active = useActiveCallStore((s) => s.active);
  const setPhase = useActiveCallStore((s) => s.setPhase);

  const lastPhaseRef = useRef<CallPhase>("idle");

  useEffect(() => {
    if (!active) return;

    // don't poll optimistic ids
    if (String(active.callId || "").startsWith("pending-")) return;

    // stop polling once terminal
    if (active.phase === "ended" || active.phase === "failed") return;

    let alive = true;
    let id: any = null;
    let inFlight = false;

    const cadence =
      active.phase === "connected"
        ? 1500
        : active.phase === "starting" || active.phase === "ringing" || active.phase === "connecting"
          ? 750
          : 1500;

    async function tick() {
      if (!alive || inFlight) return;
      inFlight = true;

      try {
        const res = await fetch(`/api/comms/calls/${encodeURIComponent(active.callId)}`, {
          method: "GET",
          headers: { "content-type": "application/json" },
        });

        // endpoint not implemented yet — silently noop
        if (!res.ok) return;

        const data = await res.json().catch(() => ({} as any));
        const next = mapBackendStatusToPhase(data?.status);

        const prev = lastPhaseRef.current;
        const patch: Partial<ActiveCall> = {};

        if (next === "connected" && prev !== "connected") {
          patch.connectedAt = data?.connectedAt || new Date().toISOString();
        }

        if (next === "ended" && prev !== "ended") {
          patch.endedAt = data?.endedAt || new Date().toISOString();
        }

        lastPhaseRef.current = next;
        setPhase(next, patch);
      } catch {
        // silent
      } finally {
        inFlight = false;
      }
    }

    tick();
    id = window.setInterval(tick, cadence);

    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [active?.callId, active?.phase, setPhase]);
}

function useCallTimer() {
  const active = useActiveCallStore((s) => s.active);
  const setPhase = useActiveCallStore((s) => s.setPhase);

  useEffect(() => {
    if (!active) return;

    const live = ["starting", "ringing", "connecting", "connected"].includes(active.phase);
    if (!live) return;

    let alive = true;
    const base = active.phase === "connected" ? active.connectedAt || active.startedAt : active.startedAt;

    const t0 = Date.parse(String(base || ""));
    if (!t0) return;

    const id = window.setInterval(() => {
      if (!alive) return;
      const sec = Math.max(0, Math.floor((Date.now() - t0) / 1000));
      setPhase(active.phase, { durationSec: sec });
    }, 1000);

    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [active?.callId, active?.phase, active?.connectedAt, active?.startedAt, setPhase]);
}

/* ---------------------------------------
 * Active call surfaces
 * ------------------------------------- */

export function ActiveCallOverlay() {
  useCallStatusPolling();
  useCallTimer();

  const active = useActiveCallStore((s) => s.active);
  const minimize = useActiveCallStore((s) => s.minimize);
  const endLocal = useActiveCallStore((s) => s.endLocal);

  if (!active || active.minimized) return null;

  const showTimer = active.phase === "connected";

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/55 backdrop-blur-sm">
      <div className="w-[min(520px,calc(100%-32px))] rounded-[28px] border border-slate-800/70 bg-slate-950/80 shadow-[0_30px_80px_rgba(0,0,0,0.55)]">
        {/* Top */}
        <div className="flex items-center justify-between gap-3 border-b border-slate-800/60 px-5 py-4">
          <div className="min-w-0">
            <p className="truncate text-[14px] font-semibold text-slate-50">
              {active.displayName}
            </p>
            <p className="truncate text-[12px] text-[var(--avillo-cream-muted)]">
              {active.to}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={minimize}
              className="rounded-xl border border-slate-800/70 bg-slate-950/55 px-3 py-1.5 text-[12px] font-semibold text-[var(--avillo-cream-soft)] hover:bg-slate-900/55"
            >
              Minimize
            </button>

            <button
              type="button"
              onClick={() => endLocal()}
              className="rounded-xl border border-rose-300/30 bg-rose-500/10 px-3 py-1.5 text-[12px] font-semibold text-rose-100 hover:bg-rose-500/15"
            >
              End
            </button>
          </div>
        </div>

        {/* Status */}
        <div className="px-5 py-5">
          <p className="text-center text-[12px] font-semibold text-[var(--avillo-cream-soft)]">
            {phaseLine(active)}
            {showTimer ? ` • ${fmtTimer(active.durationSec)}` : ""}
          </p>

          {!!active.lastError && (
            <div className="mt-3 rounded-2xl border border-rose-400/40 bg-rose-950/35 px-4 py-3 text-[12px] text-rose-50">
              {active.lastError}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function MiniCallPill() {
  const active = useActiveCallStore((s) => s.active);
  const restore = useActiveCallStore((s) => s.restore);
  const endLocal = useActiveCallStore((s) => s.endLocal);

  if (!active || !active.minimized) return null;

  const status =
    active.phase === "connected" ? fmtTimer(active.durationSec) : phaseLine(active);

  return (
    <div className="fixed bottom-4 right-4 z-[60]">
      <div className="flex items-center gap-3 rounded-full border border-slate-800/70 bg-slate-950/85 px-4 py-2 shadow-[0_20px_60px_rgba(0,0,0,0.55)] backdrop-blur-xl">
        <button
          type="button"
          onClick={restore}
          className="flex items-center gap-2"
          title="Return to call"
        >
          <span
            className={cx(
              "h-2.5 w-2.5 rounded-full",
              active.phase === "connected"
                ? "bg-emerald-300 shadow-[0_0_10px_rgba(52,211,153,0.7)]"
                : "bg-amber-200 shadow-[0_0_10px_rgba(253,224,71,0.7)]"
            )}
          />
          <div className="min-w-0">
            <p className="max-w-[180px] truncate text-[12px] font-semibold text-slate-50">
              {active.displayName}
            </p>
            <p className="text-[11px] text-[var(--avillo-cream-muted)]">{status}</p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => endLocal()}
          className="rounded-full border border-rose-300/30 bg-rose-500/10 px-3 py-1.5 text-[12px] font-semibold text-rose-100 hover:bg-rose-500/15"
          title="End call"
        >
          End
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------
 * Calls panel (history + in-call surfaces)
 * ------------------------------------- */

type CallsPanelProps = {
  isLocal: boolean;
  loading: boolean;
  error: string | null;
  calls: CallItem[];
  disabled: boolean;
  activeConvo: Conversation | null;

  hasMyNumber?: boolean;
  commsLocked?: boolean;

  forwardingPhone?: string | null;

  onStartCallFallback?: () => void;
};

export function CallsPanel({
  isLocal,
  loading,
  error,
  calls,
  disabled,
  activeConvo,
  hasMyNumber,
  commsLocked,
  forwardingPhone,
  onStartCallFallback,
}: CallsPanelProps) {
  const active = useActiveCallStore((s) => s.active);
  const beginOutgoingCall = useActiveCallStore((s) => s.beginOutgoingCall);

  const isCalling =
    !!active && active.phase !== "ended" && active.phase !== "failed";

  const canStart =
    !!activeConvo &&
    !disabled &&
    (!active || active.phase === "ended" || active.phase === "failed");

  const onStart = async () => {
    if (!activeConvo) return;

    if (typeof hasMyNumber === "boolean" && typeof commsLocked === "boolean") {
      const res = await beginOutgoingCall({
        convo: activeConvo,
        hasMyNumber,
        commsLocked,
        forwardingPhone: forwardingPhone ?? null,
      });

      if (!res.ok && onStartCallFallback) onStartCallFallback();
      return;
    }

    if (onStartCallFallback) onStartCallFallback();
  };

  return (
    <div className="relative h-full min-h-0 rounded-[26px] border border-slate-800/60 bg-slate-950/45 shadow-[0_0_40px_rgba(0,0,0,0.25)] flex flex-col overflow-hidden">
      {(error || isLocal) && (
        <div className="shrink-0 border-b border-slate-800/60 px-4 py-3">
          {!!error && (
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
          onClick={onStart}
          disabled={!canStart}
          className={cx(
            "rounded-full px-4 py-2 text-[12px] font-semibold",
            !canStart
              ? "border border-slate-800/70 bg-slate-950/40 text-[var(--avillo-cream-muted)] opacity-70"
              : "border border-emerald-200/30 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/15"
          )}
        >
          {isCalling ? "Calling…" : "Call"}
        </button>
      </div>

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
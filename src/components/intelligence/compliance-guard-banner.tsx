"use client";

import React from "react";

type Hit = { type: "HARD" | "SOFT"; match: string; rule: string };

export function ComplianceGuardBanner({
  error,
  hits,
  onClose,
}: {
  error?: string;
  hits?: Hit[];
  onClose?: () => void;
}) {
  const hardHits = (hits ?? []).filter((h) => h.type === "HARD");

  // ✅ HARD-only: must have an error AND at least one HARD hit
  if (!error || hardHits.length === 0) return null;

  const title = "Compliance safeguard";
  const severityLabel = "Blocked";

  const message =
    error ||
    "We blocked this request because it includes protected-class targeting or steering language. Avillo can’t assist with that.";

  return (
    <div className="mb-4 overflow-hidden rounded-2xl border border-[var(--avillo-border-subtle)] bg-[var(--avillo-bg-elevated)] shadow-[0_0_0_1px_rgba(250,250,249,0.06)]">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 px-5 py-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[rgba(244,210,106,0.14)]">
            🛡️
          </span>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[13px] font-semibold tracking-[0.02em] text-[var(--avillo-cream)]">
                {title}
              </h3>

              <span className="rounded-full border border-[var(--avillo-border-subtle)] bg-[rgba(255,255,255,0.02)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--avillo-cream-muted)]">
                Guardrails
              </span>
            </div>

            <p className="mt-1 text-sm leading-relaxed text-[var(--avillo-cream-soft)]">
              {message}
            </p>
          </div>
        </div>

        {/* Severity pill (HARD-only) */}
        <span
          className={[
            "shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]",
            "border-[rgba(248,113,113,0.35)] bg-[rgba(248,113,113,0.10)] text-[rgba(248,113,113,0.95)]",
          ].join(" ")}
        >
          {severityLabel}
        </span>
      </div>

      <div className="h-px w-full bg-[rgba(250,250,249,0.06)]" />

      {/* Body */}
      <div className="px-5 py-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)]">
          What we caught
        </p>

        <div className="mt-3 space-y-2">
          {hardHits.slice(0, 6).map((h, idx) => (
            <div
              key={idx}
              className="rounded-2xl border border-[var(--avillo-border-subtle)] bg-[rgba(255,255,255,0.02)] px-4 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-[var(--avillo-cream)]">
                    “<span className="font-semibold">{h.match}</span>”
                  </p>
                  <p className="mt-1 text-xs text-[var(--avillo-cream-muted)]">
                    {h.rule}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 rounded-2xl border border-[var(--avillo-border-subtle)] bg-[rgba(255,255,255,0.015)] px-4 py-3">
          <p className="text-xs text-[var(--avillo-cream-muted)]">
            Tip: Describe the{" "}
            <span className="text-[var(--avillo-cream)]">property</span>,{" "}
            <span className="text-[var(--avillo-cream)]">features</span>,{" "}
            <span className="text-[var(--avillo-cream)]">amenities</span>, and{" "}
            <span className="text-[var(--avillo-cream)]">location logistics</span>{" "}
            (commute, nearby shops, parks) — not who the home is “for.”
          </p>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[11px] text-[var(--avillo-cream-muted)]">
            We’re not legal advice — we’re your guardrails.
          </p>

          {onClose ? (
            <button
              onClick={onClose}
              type="button"
              className="rounded-xl border border-[var(--avillo-border-subtle)] bg-[rgba(255,255,255,0.02)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--avillo-cream-soft)] hover:bg-[rgba(255,255,255,0.05)]"
            >
              Got it
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

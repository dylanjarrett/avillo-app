"use client";

import { useState } from "react";

type StepType = "SMS" | "EMAIL" | "TASK" | "WAIT";

type Props = {
  type: StepType | null;
  onClose: () => void;
  onSave: (config: any) => void;
};

export default function StepModal({ type, onClose, onSave }: Props) {
  const [form, setForm] = useState<any>({});

  function update(key: string, value: any) {
    setForm((prev: any) => ({ ...prev, [key]: value }));
  }

  function save() {
    onSave(form);
  }

  if (!type) return null;

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div
        className="
          relative w-full max-w-lg rounded-2xl border border-slate-700/70 
          bg-gradient-to-b from-slate-900/80 to-slate-950 
          px-6 py-6 shadow-[0_0_40px_rgba(15,23,42,0.9)]
        "
      >
        {/* Glow */}
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(248,250,252,0.2),transparent_55%)] opacity-40 blur-3xl" />

        {/* HEADER */}
        <h3 className="text-[13px] font-semibold text-slate-50 mb-4 tracking-[0.02em]">
          {type === "SMS" && "SMS Message"}
          {type === "EMAIL" && "Email Step"}
          {type === "TASK" && "Task Reminder"}
          {type === "WAIT" && "Wait / Delay"}
        </h3>

        {/* -------------------- */}
        {/*   SMS STEP FORM     */}
        {/* -------------------- */}
        {type === "SMS" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-700/80 bg-slate-900/70 px-3 py-3">
              <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)]">
                Text Message
              </label>
              <textarea
                rows={4}
                className="mt-1 w-full resize-none bg-transparent text-[11px] text-slate-50 outline-none placeholder:text-[var(--avillo-cream-muted)]"
                placeholder="Ex: Hey! Thanks for reaching out — when are you available to view homes?"
                onChange={(e) => update("text", e.target.value)}
              />
            </div>
          </div>
        )}

        {/* -------------------- */}
        {/*   EMAIL STEP FORM    */}
        {/* -------------------- */}
        {type === "EMAIL" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-700/80 bg-slate-900/70 px-3 py-3">
              <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)]">
                Subject
              </label>
              <input
                className="mt-1 w-full bg-transparent text-[11px] text-slate-50 outline-none placeholder:text-[var(--avillo-cream-muted)]"
                placeholder="Ex: Quick market update"
                onChange={(e) => update("subject", e.target.value)}
              />
            </div>

            <div className="rounded-xl border border-slate-700/80 bg-slate-900/70 px-3 py-3">
              <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)]">
                Body
              </label>
              <textarea
                rows={6}
                className="mt-1 w-full resize-none bg-transparent text-[11px] text-slate-50 outline-none placeholder:text-[var(--avillo-cream-muted)]"
                placeholder="Write the full email body…"
                onChange={(e) => update("body", e.target.value)}
              />
            </div>
          </div>
        )}

        {/* -------------------- */}
        {/*   TASK STEP FORM     */}
        {/* -------------------- */}
        {type === "TASK" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-700/80 bg-slate-900/70 px-3 py-3">
              <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)]">
                Task Description
              </label>
              <input
                className="mt-1 w-full bg-transparent text-[11px] text-slate-50 outline-none placeholder:text-[var(--avillo-cream-muted)]"
                placeholder="Ex: Call lead about showing availability"
                onChange={(e) => update("text", e.target.value)}
              />
            </div>
          </div>
        )}

        {/* -------------------- */}
        {/*    WAIT STEP FORM    */}
        {/* -------------------- */}
        {type === "WAIT" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-700/80 bg-slate-900/70 px-3 py-3">
              <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)]">
                Delay (Hours)
              </label>
              <input
                type="number"
                min={1}
                className="mt-1 w-full bg-transparent text-[11px] text-slate-50 outline-none placeholder:text-[var(--avillo-cream-muted)]"
                placeholder="Ex: 12"
                onChange={(e) => update("hours", Number(e.target.value))}
              />
            </div>
          </div>
        )}

        {/* -------------------- */}
        {/*   FOOTER BUTTONS     */}
        {/* -------------------- */}
        <div className="mt-6 flex items-center justify-between">
          <button
            onClick={onClose}
            className="
              inline-flex items-center justify-center rounded-full
              border border-slate-600/80 bg-slate-900/80
              px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em]
              text-[var(--avillo-cream-muted)] hover:text-slate-100 hover:border-slate-500
            "
          >
            Cancel
          </button>

          <button
            onClick={save}
            className="
              inline-flex items-center justify-center rounded-full
              border border-amber-100/80 bg-amber-50/10
              px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em]
              text-amber-100 shadow-[0_0_20px_rgba(248,250,252,0.18)]
              hover:bg-amber-50/20
            "
          >
            Save Step
          </button>
        </div>
      </div>
    </div>
  );
}
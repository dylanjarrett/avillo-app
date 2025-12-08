// src/components/autopilot/StepModal.tsx
"use client";

import { useEffect, useState } from "react";

export type StepType = "SMS" | "EMAIL" | "TASK" | "WAIT";

type Props = {
  type: StepType | null;
  initialConfig?: any | null; // pass config when editing a step
  onClose: () => void;
  onSave: (config: any) => void;
};

export default function StepModal({
  type,
  initialConfig,
  onClose,
  onSave,
}: Props) {
  const [form, setForm] = useState<any>(initialConfig ?? {});

  // Reset form whenever we open for a new type or step
  useEffect(() => {
    setForm(initialConfig ?? {});
  }, [initialConfig, type]);

  function update(key: string, value: any) {
    setForm((prev: any) => ({ ...prev, [key]: value }));
  }

  function handleSave() {
    if (type === "WAIT") {
      const hoursRaw = form.hours;
      const hours =
        typeof hoursRaw === "number"
          ? hoursRaw
          : Number.parseFloat(String(hoursRaw ?? ""));
      if (!hours || Number.isNaN(hours) || hours <= 0) {
        alert("Set a delay of at least 1 hour.");
        return;
      }
      onSave({ ...form, hours });
      return;
    }

    onSave(form);
  }

  if (!type) return null;

  const isEditing = !!initialConfig;

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
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[13px] font-semibold tracking-[0.02em] text-slate-50">
              {type === "SMS" && (isEditing ? "Edit SMS" : "Add SMS message")}
              {type === "EMAIL" && (isEditing ? "Edit email" : "Add email step")}
              {type === "TASK" && (isEditing ? "Edit task" : "Add task reminder")}
              {type === "WAIT" && (isEditing ? "Edit delay" : "Add wait / delay")}
            </h3>
            <p className="mt-1 text-[10px] text-[var(--avillo-cream-muted)]">
              {type === "SMS" &&
                "Short, conversational text. Use merge tags to personalize."}
              {type === "EMAIL" &&
                "Subject + full body. You can paste from Intelligence and tweak it here."}
              {type === "TASK" &&
                "This shows up as a to-do for you – keep it clear and action-focused."}
              {type === "WAIT" &&
                "Tell Avillo how long to pause before the next step runs."}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)] hover:text-slate-100"
          >
            ✕
          </button>
        </div>

        {/* SMS STEP FORM */}
        {type === "SMS" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-700/80 bg-slate-900/70 px-3 py-3">
              <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)]">
                Text Message
              </label>
              <textarea
                rows={4}
                className="mt-1 w-full resize-none bg-transparent text-[11px] text-slate-50 outline-none placeholder:text-[var(--avillo-cream-muted)]"
                placeholder="Ex: Hey {{firstName}}, thanks for reaching out — when are you free for a quick call?"
                value={form.text ?? ""}
                onChange={(e) => update("text", e.target.value)}
              />
              <p className="mt-1 text-[9px] text-[var(--avillo-cream-muted)]">
                Variables:{" "}
                <code>{"{{firstName}}"}</code>,{" "}
                <code>{"{{agentName}}"}</code>,{" "}
                <code>{"{{propertyAddress}}"}</code>
              </p>
            </div>
          </div>
        )}

        {/* EMAIL STEP FORM */}
        {type === "EMAIL" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-700/80 bg-slate-900/70 px-3 py-3">
              <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)]">
                Subject
              </label>
              <input
                className="mt-1 w-full bg-transparent text-[11px] text-slate-50 outline-none placeholder:text-[var(--avillo-cream-muted)]"
                placeholder="Ex: Quick market update for you"
                value={form.subject ?? ""}
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
                value={form.body ?? ""}
                onChange={(e) => update("body", e.target.value)}
              />
            </div>
          </div>
        )}

        {/* TASK STEP FORM */}
        {type === "TASK" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-700/80 bg-slate-900/70 px-3 py-3">
              <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)]">
                Task Description
              </label>
              <input
                className="mt-1 w-full bg-transparent text-[11px] text-slate-50 outline-none placeholder:text-[var(--avillo-cream-muted)]"
                placeholder="Ex: Call {{firstName}} to confirm search criteria"
                value={form.text ?? ""}
                onChange={(e) => update("text", e.target.value)}
              />
            </div>
          </div>
        )}

        {/* WAIT STEP FORM */}
        {type === "WAIT" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-700/80 bg-slate-900/70 px-3 py-3">
              <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)]">
                Delay (hours)
              </label>
            <input
              type="number"
              min={1}
              className="mt-1 w-full bg-transparent text-[11px] text-slate-50 outline-none placeholder:text-[var(--avillo-cream-muted)]"
              placeholder="Ex: 4"
              value={form.hours ?? ""}
              onChange={(e) => update("hours", e.target.value)}
            />
            <p className="mt-1 text-[9px] text-[var(--avillo-cream-muted)]">
              Example: 4 = send the next step about 4 hours later. 24 = next day.
            </p>
          </div>
        </div>
        )}

        {/* FOOTER BUTTONS */}
        <div className="mt-6 flex items-center justify-between">
          <button
            type="button"
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
            type="button"
            onClick={handleSave}
            className="
              inline-flex items-center justify-center rounded-full
              border border-amber-100/80 bg-amber-50/10
              px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em]
              text-amber-100 shadow-[0_0_20px_rgba(248,250,252,0.18)]
              hover:bg-amber-50/20
            "
          >
            {isEditing ? "Update step" : "Save step"}
          </button>
        </div>
      </div>
    </div>
  );
}
// src/components/intelligence/OutputCanvas.tsx
"use client";

import React, { useState } from "react";
import { saveToCRM } from "@/lib/crm";

interface OutputCanvasProps {
  output: string;
  loading: boolean;
}

export default function OutputCanvas({ output, loading }: OutputCanvasProps) {
  const [saving, setSaving] = useState(false);

  const hasOutput = !!output.trim();

  async function handleSave() {
    if (!hasOutput || saving) return;
    setSaving(true);
    try {
      await saveToCRM({
        processed: output,
        raw: "",
        type: "general",
      });
    } catch (err) {
      console.error("saveToCRM error", err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-slate-950/80 rounded-2xl border border-slate-700/70 shadow-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.18em] text-amber-100/70 uppercase">
              AI output
            </p>
            <h2 className="text-lg font-semibold text-slate-50">
              Studio canvas
            </h2>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                if (!hasOutput) return;
                navigator.clipboard.writeText(output).catch(() => {});
              }}
              className="rounded-full border border-slate-600 px-3 py-1 text-xs text-slate-200 hover:bg-slate-800/70"
            >
              Copy
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!hasOutput || saving}
              className="rounded-full border border-amber-200/60 bg-amber-100/90 px-3 py-1 text-xs font-semibold text-slate-900 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save to CRM"}
            </button>
          </div>
        </div>

        <div className="min-h-[240px] rounded-xl border border-slate-700 bg-slate-900/40 p-4 text-sm text-slate-100 whitespace-pre-wrap">
          {loading
            ? "Generating…"
            : hasOutput
            ? output
            : "Choose an engine, drop in your notes, and hit Generate to see results here."}
        </div>
      </div>
    </div>
  );
}
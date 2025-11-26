// src/components/intelligence/engines/NeighborhoodEngine.tsx
"use client";

import { useState } from "react";
import type { NeighborhoodPack, NeighborhoodTabId } from "@/lib/intelligence";
import { NeighborhoodOutputCanvas } from "@/components/intelligence/OutputCard";

type NeighborhoodEngineProps = {
  isGenerating: boolean;
  setIsGenerating: (value: boolean) => void;
  setOutput: (pack: NeighborhoodPack | null) => void;
  setError: (message: string | null) => void;
};

export default function NeighborhoodEngine({
  isGenerating,
  setIsGenerating,
  setOutput,
  setError,
}: NeighborhoodEngineProps) {
  const [areaFocus, setAreaFocus] = useState("");
  const [contextNotes, setContextNotes] = useState("");
  const [pack, setPack] = useState<NeighborhoodPack | null>(null);
  const [savingCrm, setSavingCrm] = useState(false);
  const [activeTab, setActiveTab] = useState<NeighborhoodTabId>("overview");

  // ----------------------------
  // Generate via /api/generate-intelligence
  // ----------------------------
  async function handleGenerate() {
    if (!areaFocus.trim()) {
      setError("Add a ZIP code, city, or neighborhood before generating.");
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const res = await fetch("/api/generate-intelligence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          engine: "neighborhood",
          areaFocus,
          context: contextNotes,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(
          data?.error || "Failed to generate neighborhood snapshot."
        );
      }

      const data = await res.json();

      const nextPack: NeighborhoodPack = data.pack ?? data.neighborhood ?? data;

      setPack(nextPack);
      setOutput(nextPack);
    } catch (err: any) {
      console.error("Neighborhood engine error", err);
      setError(err?.message || "Something went wrong while generating.");
    } finally {
      setIsGenerating(false);
    }
  }

  // ----------------------------
  // Save to CRM
  // ----------------------------
  async function handleSaveToCrm() {
    if (!pack) return;

    setSavingCrm(true);
    try {
      await fetch("/api/crm/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          engine: "neighborhood",
          payload: pack,
        }),
      });
    } catch (err) {
      console.error("Failed to save neighborhood pack to CRM", err);
    } finally {
      setSavingCrm(false);
    }
  }

  // ----------------------------
  // Render
  // ----------------------------
  return (
    <section className="grid gap-7 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1.5fr)]">

      {/* LEFT INPUT CARD */}
      <div
        className="
          relative overflow-hidden rounded-2xl border border-slate-700/70 
          bg-slate-950/80 px-6 py-5 shadow-[0_0_40px_rgba(15,23,42,0.85)]
          mb-8 pb-4
        "
      >
        <div className="pointer-events-none absolute inset-0 -z-10 opacity-40 blur-3xl bg-[radial-gradient(circle_at_top_left,_rgba(248,250,252,0.16),transparent_55%)]" />

        <h2 className="mb-1 text-sm font-semibold text-slate-50">
          Neighborhood Engine
        </h2>
        <p className="mb-4 text-xs text-slate-200/90">
          Turn any ZIP code, city, or neighborhood into a simple lifestyle
          snapshot: schools, walk &amp; bike feel, safety context, essentials,
          and buyer-ready talking points.
        </p>

        <div className="space-y-3 text-xs text-slate-100">
          <div>
            <label className="mb-2 block text-[11px] font-medium uppercase tracking-[0.18em] text-slate-300/90">
              Area focus
            </label>
            <input
              value={areaFocus}
              onChange={(e) => setAreaFocus(e.target.value)}
              placeholder="92626, Costa Mesa, or Eastside Costa Mesa…"
              className="avillo-input w-full"
            />
          </div>

          <div>
            <label className="mb-2 block text-[11px] font-medium uppercase tracking-[0.18em] text-slate-300/90">
              Context / client notes (optional)
            </label>
            <textarea
              value={contextNotes}
              onChange={(e) => setContextNotes(e.target.value)}
              rows={3}
              placeholder="Buyer profile, price range, commute needs, lifestyle preferences…"
              className="avillo-textarea w-full"
            />
          </div>

          <p className="mt-2 text-[11px] text-slate-300/90">
            AI predictions rely on typical local patterns. Always verify
            schools, zoning, and crime sources before sending to clients.
          </p>
        </div>

        <button
  type="button"
  onClick={handleGenerate}
  disabled={isGenerating}
  className="mt-4 inline-flex w-full items-center justify-center rounded-full border border-amber-100/70 bg-amber-50/10 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100 shadow-[0_0_30px_rgba(248,250,252,0.22)] hover:bg-amber-50/20 disabled:cursor-not-allowed disabled:opacity-60"
>
  {isGenerating ? "Generating…" : "Generate Snapshot"}
</button>
      </div>

      {/* RIGHT OUTPUT CANVAS */}
      <NeighborhoodOutputCanvas
        pack={pack}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onSaveToCrm={handleSaveToCrm}
        savingCrm={savingCrm}
      />
    </section>
  );
}
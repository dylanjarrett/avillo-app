// src/components/intelligence/engines/ListingEngine.tsx
"use client";

import { useState } from "react";
import type { IntelligencePack, ListingTabId } from "@/lib/intelligence";
import { ListingOutputCanvas } from "@/components/intelligence/OutputCard";

type ListingEngineProps = {
  isGenerating: boolean;
  setIsGenerating: (value: boolean) => void;
  setOutput: (pack: IntelligencePack | null) => void;
  setError: (message: string | null) => void;
};

export default function ListingEngine({
  isGenerating,
  setIsGenerating,
  setOutput,
  setError,
}: ListingEngineProps) {
  const [propertyText, setPropertyText] = useState("");
  const [activeTab, setActiveTab] = useState<ListingTabId>("listing");
  const [pack, setPack] = useState<IntelligencePack | null>(null);
  const [savingCrm, setSavingCrm] = useState(false);

  // -------- Generate listing pack via API --------
  async function handleGenerate() {
    if (!propertyText.trim()) {
      setError("Please add property notes first.");
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const res = await fetch("/api/generate-intelligence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          engine: "listing",
          notes: propertyText,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to generate listing pack.");
      }

      const data = await res.json();
      const nextPack = (data.pack ?? data) as IntelligencePack;

      setPack(nextPack);
      setOutput(nextPack);
    } catch (err: any) {
      console.error("Failed to generate listing pack", err);
      setError(err?.message || "Something went wrong while generating.");
    } finally {
      setIsGenerating(false);
    }
  }

  // -------- Save to CRM --------
  async function handleSaveToCrm() {
    if (!pack) return;

    setSavingCrm(true);
    try {
      await fetch("/api/crm/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          engine: "listing",
          payload: pack,
        }),
      });
      // later: toast
    } catch (err) {
      console.error("Failed to save listing pack to CRM", err);
    } finally {
      setSavingCrm(false);
    }
  }

  return (
    <section className="grid gap-7 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1.5fr)]">
      {/* ---------- LEFT: INPUT CARD (CRM style) ---------- */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-950/80 px-6 py-5 shadow-[0_0_40px_rgba(15,23,42,0.85)]">
        {/* subtle glow */}
        <div className="pointer-events-none absolute inset-0 -z-10 opacity-40 blur-3xl bg-[radial-gradient(circle_at_top_left,_rgba(248,250,252,0.16),transparent_55%)]" />

        <h2 className="mb-1 text-sm font-semibold text-slate-50">
          Listing Engine
        </h2>
        <p className="mb-4 text-xs text-slate-200/90">
          Turn messy property notes into a full MLS + social + email + insights
          pack.
        </p>

        <label className="mb-2 block text-[11px] font-medium uppercase tracking-[0.18em] text-slate-300/90">
          Property notes
        </label>

        <textarea
          value={propertyText}
          onChange={(e) => setPropertyText(e.target.value)}
          placeholder="3 Bed • 3 Bath • San Diego — upgrades, lot size, schools, neighborhood vibes…"
          className="mb-4 h-44 w-full rounded-xl border border-slate-700/70 bg-slate-900/80 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-100/70 focus:border-amber-100/70"
        />

        <button
          type="button"
          onClick={handleGenerate}
          disabled={isGenerating}
          className="mt-2 inline-flex w-full items-center justify-center rounded-full border border-amber-100/70 bg-amber-50/10 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100 shadow-[0_0_30px_rgba(248,250,252,0.22)] hover:bg-amber-50/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isGenerating ? "Generating listing pack…" : "Generate Listing Pack"}
        </button>

        <p className="mt-2 text-[11px] text-slate-300/90">
          Outputs stay in this session only. Paste them directly into your CRM,
          emails, and MLS.
        </p>
      </div>

      {/* ---------- RIGHT: OUTPUT CANVAS (CRM shell via OutputCard) ---------- */}
      <ListingOutputCanvas
        pack={pack}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onSaveToCrm={handleSaveToCrm}
        savingCrm={savingCrm}
      />
    </section>
  );
}
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
      // In the future you can swap this for a toast
    } catch (err) {
      console.error("Failed to save listing pack to CRM", err);
    } finally {
      setSavingCrm(false);
    }
  }

  return (
    <section className="grid gap-7 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1.5fr)]">
      {/* ---------- LEFT: INPUT CARD ---------- */}
      <div className="avillo-card p-5">
        <h2 className="mb-1 text-sm font-semibold text-[var(--avillo-cream)]">
          Listing Engine
        </h2>
        <p className="mb-4 text-xs text-[var(--avillo-cream-muted)]">
          Turn messy property notes into a full MLS + social + email + insights
          pack.
        </p>

        <label className="mb-2 block text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)]">
          Property notes
        </label>

        <textarea
          value={propertyText}
          onChange={(e) => setPropertyText(e.target.value)}
          placeholder="3 Bed • 3 Bath • San Diego — upgrades, lot size, schools, neighborhood vibes…"
          className="avillo-textarea mb-4 h-44 w-full"
        />

        <button
          type="button"
          onClick={handleGenerate}
          disabled={isGenerating}
          className="avillo-btn mt-2 flex w-full items-center justify-center disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isGenerating ? "Generating listing pack…" : "Generate Listing Pack"}
        </button>

        <p className="mt-2 text-[11px] text-[var(--avillo-cream-muted)]">
          Outputs stay in this session only. Paste them directly into your CRM,
          emails, and MLS.
        </p>
      </div>

      {/* ---------- RIGHT: OUTPUT CANVAS (moved to OutputCard.tsx) ---------- */}
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
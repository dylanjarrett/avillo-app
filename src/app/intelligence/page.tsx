// src/app/intelligence/page.tsx
"use client";

import { useState } from "react";

import ListingEngine from "@/components/intelligence/engines/ListingEngine";
import SellerEngine from "@/components/intelligence/engines/SellerEngine";
import BuyerEngine from "@/components/intelligence/engines/BuyerEngine";
import CRMHistory from "@/components/intelligence/CRMHistory";

type ActiveEngine = "listing" | "seller" | "buyer";

export default function IntelligencePage() {
  const [activeEngine, setActiveEngine] = useState<ActiveEngine>("listing");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, setOutput] = useState<any | null>(null); // reserved for future use

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-4 pb-16 pt-10 lg:px-6">
      {/* --------- Hero / Header --------- */}
      <header>
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--avillo-cream-muted)]">
          AI Tools for Real Estate
        </p>
        <h1 className="text-balance text-2xl font-semibold text-[var(--avillo-cream)] sm:text-3xl">
          Avillo AI Command Center
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--avillo-cream-muted)]">
          Transform raw notes into listing packs, seller scripts, buyer
          follow-ups, and CRM-ready insights — all in one workspace.
        </p>

        {/* Engine selector pills */}
        <div className="mt-5 inline-flex flex-wrap gap-2 text-xs avillo-pill-group">
          <EnginePill
            label="Listing Engine"
            description="MLS, social, emails, talking points."
            active={activeEngine === "listing"}
            onClick={() => setActiveEngine("listing")}
          />
          <EnginePill
            label="Seller Engine"
            description="Prelistings, presentations, objections."
            active={activeEngine === "seller"}
            onClick={() => setActiveEngine("seller")}
          />
          <EnginePill
            label="Buyer Engine"
            description="Tours, summaries, offers, nurture."
            active={activeEngine === "buyer"}
            onClick={() => setActiveEngine("buyer")}
          />
        </div>
      </header>

      {/* --------- Error bar --------- */}
      {error && (
        <div className="avillo-error-bar">
          {error}
        </div>
      )}

      {/* --------- Engines --------- */}
      <section className="grid gap-7 lg:grid-cols-1">
        {activeEngine === "listing" && (
          <ListingEngine
            isGenerating={isGenerating}
            setIsGenerating={setIsGenerating}
            setOutput={setOutput}
            setError={setError}
          />
        )}

        {activeEngine === "seller" && (
          <SellerEngine
            isGenerating={isGenerating}
            setIsGenerating={setIsGenerating}
            setOutput={setOutput}
            setError={setError}
          />
        )}

        {activeEngine === "buyer" && (
          <BuyerEngine
            isGenerating={isGenerating}
            setIsGenerating={setIsGenerating}
            setOutput={setOutput}
            setError={setError}
          />
        )}
      </section>

      {/* --------- CRM History --------- */}
      <CRMHistory />
    </main>
  );
}

/* ----------------------
 * Small sub-component
 * ---------------------*/

type EnginePillProps = {
  label: string;
  description: string;
  active?: boolean;
  onClick: () => void;
};

function EnginePill({ label, description, active, onClick }: EnginePillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "avillo-pill min-w-[170px] justify-between sm:justify-start " +
        (active ? " avillo-pill--active" : "")
      }
    >
      <span className="flex flex-col text-left">
        <span className="text-[11px] font-medium">{label}</span>
        <span className="text-[10px] text-[var(--avillo-cream-muted)]">
          {description}
        </span>
      </span>
    </button>
  );
}